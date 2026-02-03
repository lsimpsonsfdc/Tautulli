# -*- coding: utf-8 -*-

# This file is part of Tautulli.
#
#  Tautulli is free software: you can redistribute it and/or modify
#  it under the terms of the GNU General Public License as published by
#  the Free Software Foundation, either version 3 of the License, or
#  (at your option) any later version.
#
#  Tautulli is distributed in the hope that it will be useful,
#  but WITHOUT ANY WARRANTY; without even the implied warranty of
#  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#  GNU General Public License for more details.
#
#  You should have received a copy of the GNU General Public License
#  along with Tautulli.  If not, see <http://www.gnu.org/licenses/>.

"""
TheTVDB API v4 Integration Module

This module provides integration with TheTVDB API v4 for fetching TV series
episode information. It is used by the Missing Episodes feature to compare
Plex library contents against the complete episode list from TheTVDB.

Features:
    - Authentication with TheTVDB API v4 using API key
    - Fetching all episodes for a TV series
    - Caching episode data in SQLite database (24-hour expiry)
    - Automatic token refresh

Configuration:
    Requires THETVDB_APIKEY to be set in Settings > 3rd Party APIs.
    API keys can be obtained from https://thetvdb.com/

Database:
    Uses the 'thetvdb_episodes' table for caching episode data.
    Table is created automatically in plexpy/__init__.py.

Usage:
    from plexpy import thetvdb

    # Get all episodes for a series (uses cache if available)
    episodes = thetvdb.get_series_episodes(thetvdb_id='81189')

    # Force refresh from API
    episodes = thetvdb.get_series_episodes(thetvdb_id='81189', refresh=True)

    # Clear cache for a series
    thetvdb.clear_cache(thetvdb_id='81189')
"""

import time

import plexpy
from plexpy import database
from plexpy import logger
from plexpy import request

BASE_URL = "https://api4.thetvdb.com/v4"
CACHE_EXPIRY = 86400  # 24 hours in seconds

_auth_token = None
_token_expiry = 0


def _get_auth_token():
    """Authenticate with TheTVDB API and get Bearer token."""
    global _auth_token, _token_expiry

    # Return cached token if still valid (tokens last 30 days, but we refresh daily)
    if _auth_token and time.time() < _token_expiry:
        return _auth_token

    api_key = plexpy.CONFIG.THETVDB_APIKEY
    if not api_key:
        logger.warn("Tautulli TheTVDB :: No API key configured.")
        return None

    url = "{}/login".format(BASE_URL)
    data = {"apikey": api_key}

    response, err_msg, req_msg = request.request_response2(
        url, method="post", json=data
    )

    if err_msg:
        logger.error("Tautulli TheTVDB :: Authentication failed: {}".format(err_msg))
        return None

    if response and response.status_code == 200:
        try:
            json_data = response.json()
            if json_data.get("status") == "success":
                _auth_token = json_data.get("data", {}).get("token")
                _token_expiry = time.time() + 86400  # Refresh token daily
                logger.debug("Tautulli TheTVDB :: Authentication successful.")
                return _auth_token
            else:
                logger.error("Tautulli TheTVDB :: Authentication failed: {}".format(
                    json_data.get("message", "Unknown error")
                ))
        except Exception as e:
            logger.error("Tautulli TheTVDB :: Failed to parse auth response: {}".format(e))
    else:
        logger.error("Tautulli TheTVDB :: Authentication failed with status: {}".format(
            response.status_code if response else "No response"
        ))

    return None


def _make_request(endpoint, params=None):
    """Make an authenticated request to the TheTVDB API."""
    token = _get_auth_token()
    if not token:
        return None

    url = "{}{}".format(BASE_URL, endpoint)
    headers = {"Authorization": "Bearer {}".format(token)}

    response, err_msg, req_msg = request.request_response2(
        url, method="get", headers=headers, params=params
    )

    if err_msg:
        logger.error("Tautulli TheTVDB :: Request failed: {}".format(err_msg))
        return None

    if response and response.status_code == 200:
        try:
            return response.json()
        except Exception as e:
            logger.error("Tautulli TheTVDB :: Failed to parse response: {}".format(e))
    elif response and response.status_code == 401:
        # Token expired, clear it and retry once
        global _auth_token, _token_expiry
        _auth_token = None
        _token_expiry = 0
        logger.warn("Tautulli TheTVDB :: Token expired, retrying...")
        return _make_request(endpoint, params)
    else:
        logger.error("Tautulli TheTVDB :: Request failed with status: {}".format(
            response.status_code if response else "No response"
        ))

    return None


def get_series_episodes(thetvdb_id, refresh=False):
    """
    Fetch all episodes for a series from TheTVDB.

    Args:
        thetvdb_id: The TheTVDB series ID
        refresh: Force refresh from API instead of using cache

    Returns:
        List of episode dictionaries with keys:
        - season_number
        - episode_number
        - episode_name
        - air_date
    """
    if not thetvdb_id:
        return None

    monitor_db = database.MonitorDatabase()

    # Check cache first (unless refresh requested)
    if not refresh:
        cached = _get_cached_episodes(thetvdb_id)
        if cached is not None:
            return cached

    # Fetch from API
    episodes = []
    page = 0

    while True:
        endpoint = "/series/{}/episodes/default".format(thetvdb_id)
        params = {"page": page}

        json_data = _make_request(endpoint, params)
        if not json_data:
            break

        data = json_data.get("data", {})
        episode_list = data.get("episodes", [])

        if not episode_list:
            break

        for ep in episode_list:
            episodes.append({
                "season_number": ep.get("seasonNumber", 0),
                "episode_number": ep.get("number", 0),
                "episode_name": ep.get("name", ""),
                "air_date": ep.get("aired", "")
            })

        # Check for more pages
        links = json_data.get("links", {})
        if links.get("next"):
            page += 1
        else:
            break

    if episodes:
        _cache_episodes(thetvdb_id, episodes)
        logger.debug("Tautulli TheTVDB :: Fetched {} episodes for series {}".format(
            len(episodes), thetvdb_id
        ))

    return episodes


def _get_cached_episodes(thetvdb_id):
    """Get cached episodes from database if not expired."""
    monitor_db = database.MonitorDatabase()

    try:
        query = """
            SELECT season_number, episode_number, episode_name, air_date, last_updated
            FROM thetvdb_episodes
            WHERE thetvdb_id = ?
            ORDER BY season_number, episode_number
        """
        results = monitor_db.select(query, args=[thetvdb_id])

        if not results:
            return None

        # Check if cache is expired
        last_updated = results[0].get("last_updated", 0)
        if time.time() - last_updated > CACHE_EXPIRY:
            logger.debug("Tautulli TheTVDB :: Cache expired for series {}".format(thetvdb_id))
            return None

        episodes = []
        for row in results:
            episodes.append({
                "season_number": row["season_number"],
                "episode_number": row["episode_number"],
                "episode_name": row["episode_name"],
                "air_date": row["air_date"]
            })

        logger.debug("Tautulli TheTVDB :: Using cached episodes for series {}".format(thetvdb_id))
        return episodes

    except Exception as e:
        logger.warn("Tautulli TheTVDB :: Failed to get cached episodes: {}".format(e))
        return None


def _cache_episodes(thetvdb_id, episodes):
    """Cache episodes to database."""
    monitor_db = database.MonitorDatabase()
    current_time = int(time.time())

    try:
        # Clear existing cache for this series
        monitor_db.action(
            "DELETE FROM thetvdb_episodes WHERE thetvdb_id = ?",
            args=[thetvdb_id]
        )

        # Insert new episodes
        for ep in episodes:
            monitor_db.action(
                """
                INSERT INTO thetvdb_episodes
                (thetvdb_id, season_number, episode_number, episode_name, air_date, last_updated)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                args=[
                    thetvdb_id,
                    ep["season_number"],
                    ep["episode_number"],
                    ep["episode_name"],
                    ep["air_date"],
                    current_time
                ]
            )

        logger.debug("Tautulli TheTVDB :: Cached {} episodes for series {}".format(
            len(episodes), thetvdb_id
        ))

    except Exception as e:
        logger.warn("Tautulli TheTVDB :: Failed to cache episodes: {}".format(e))


def clear_cache(thetvdb_id=None):
    """Clear cached episodes from database."""
    monitor_db = database.MonitorDatabase()

    try:
        if thetvdb_id:
            monitor_db.action(
                "DELETE FROM thetvdb_episodes WHERE thetvdb_id = ?",
                args=[thetvdb_id]
            )
            logger.debug("Tautulli TheTVDB :: Cleared cache for series {}".format(thetvdb_id))
        else:
            monitor_db.action("DELETE FROM thetvdb_episodes")
            logger.debug("Tautulli TheTVDB :: Cleared all cached episodes")
        return True
    except Exception as e:
        logger.warn("Tautulli TheTVDB :: Failed to clear cache: {}".format(e))
        return False
