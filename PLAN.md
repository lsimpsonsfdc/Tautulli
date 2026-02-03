# Implementation Plan: Missing Episodes Feature

## Status: COMPLETED

This feature has been fully implemented. See the Implementation Summary below.

---

## Overview
Add a "Missing Episodes" tab to TV library pages that allows checking individual shows against TheTVDB to identify missing episodes. Only aired episodes will be shown as missing.

---

## Implementation Summary

### Files Created

| File | Description |
|------|-------------|
| `plexpy/thetvdb.py` | TheTVDB API v4 integration module with authentication, episode fetching, and caching |
| `data/interfaces/default/js/tables/missing_episodes_table.js` | DataTable configuration and UI handlers for the Missing Episodes tab |

### Files Modified

| File | Changes |
|------|---------|
| `plexpy/config.py` | Added `THETVDB_APIKEY` configuration setting |
| `plexpy/__init__.py` | Added `thetvdb_episodes` database table with index |
| `plexpy/libraries.py` | Added `get_shows_for_missing_episodes()` and `get_missing_episodes_for_show()` methods |
| `plexpy/webserve.py` | Added `get_library_missing_episodes` and `get_show_missing_episodes` API endpoints; added `thetvdb_apikey` to library config |
| `data/interfaces/default/library.html` | Added Missing Episodes tab (link, panel, JS initialization, loading indicator) |
| `data/interfaces/default/settings.html` | Added TheTVDB API key input field in 3rd Party APIs section |
| `CHANGELOG.md` | Added changelog entry for v2.16.1 |

---

## Features Implemented

- **Missing Episodes Tab**: New tab on TV library pages showing all shows with their TVDB status
- **Per-Show Checking**: Click "Check" to compare a show against TheTVDB
- **Missing Episodes Modal**: View detailed list of missing episodes (season, episode, title, air date)
- **Episode Caching**: TheTVDB data cached for 24 hours to reduce API calls
- **Season 0 Exclusion**: Specials are excluded from the comparison
- **Unaired Episode Exclusion**: Only episodes that have already aired are shown as missing
- **Conditional Tab Display**: Tab only appears if TheTVDB API key is configured
- **Loading Indicator**: Shows "Loading shows..." while data is being fetched

---

## API Endpoints

### `get_library_missing_episodes`
Get list of shows in a TV library with their TVDB IDs.

**Parameters:**
- `section_id` (required): The Plex library section ID

**Returns:** List of shows with rating_key, title, year, thumb, episode_count, thetvdb_id

### `get_show_missing_episodes`
Get missing episodes for a specific TV show.

**Parameters:**
- `rating_key` (required): The Plex rating key for the show
- `refresh` (optional): Force refresh from TheTVDB API (default: false)

**Returns:** Show info, list of missing episodes, total counts, and any error message

---

## Configuration

Users must configure a TheTVDB API key in **Settings > 3rd Party APIs** for this feature to work.

API keys can be obtained from https://thetvdb.com/ (free for personal use).

---

## Database Schema

```sql
CREATE TABLE IF NOT EXISTS thetvdb_episodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    thetvdb_id INTEGER,
    season_number INTEGER,
    episode_number INTEGER,
    episode_name TEXT,
    air_date TEXT,
    last_updated INTEGER
)

CREATE INDEX IF NOT EXISTS idx_thetvdb_episodes_thetvdb_id ON thetvdb_episodes(thetvdb_id)
```

---

## UI Design

### Missing Episodes Tab (shows list)
```
+------------------------------------------------------------------+
| Missing Episodes for [Library Name]                               |
+------------------------------------------------------------------+
| [Poster] | Show Name     | Year | Episodes | TVDB ID | Status    |
|----------|---------------|------|----------|---------|-----------|
| [img]    | Breaking Bad  | 2008 | 62       | 81189   | [Check]   |
| [img]    | Game of...    | 2011 | 70       | 121361  | Missing:3 |
| [img]    | The Office    | 2005 | 201      | 73244   | Complete  |
+------------------------------------------------------------------+
```

### Missing Episodes Modal
```
+--------------------------------------------------------------+
| Missing Episodes - Game of Thrones (3)                    [X] |
+--------------------------------------------------------------+
| Season | Episode | Title              | Air Date             |
|--------|---------|--------------------|--------------------- |
| 2      | 5       | The Ghost of...    | 2019-04-21          |
| 4      | 3       | The Long Night     | 2019-04-28          |
| 8      | 6       | The Iron Throne    | 2019-05-19          |
+--------------------------------------------------------------+
|                                                      [Close]  |
+--------------------------------------------------------------+
```

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| No API key configured | Missing Episodes tab is hidden |
| Show has no TVDB ID | "N/A" shown, Check button disabled |
| API authentication fails | Error status shown with message |
| Network error | Error status shown, retry button available |

---

## Notes

- Only shows with `section_type == 'show'` will have this tab
- Only admin users can see the Missing Episodes tab
- Specials (Season 0) are excluded from the comparison
- Cache expires after 24 hours; data is refreshed automatically on next check
- Episodes with air date in the future are excluded from "missing"
