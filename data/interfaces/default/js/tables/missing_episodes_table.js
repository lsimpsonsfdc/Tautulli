/**
 * Missing Episodes Table for TV Libraries
 *
 * This DataTable displays all TV shows in a library and allows users to check
 * each show for missing episodes by comparing against TheTVDB.
 *
 * Features:
 *   - Lists all shows with their Plex episode count and TVDB ID
 *   - "Check" button to compare against TheTVDB for each show
 *   - Shows status: Complete, Missing (with count), or Error
 *   - "View" button opens modal with list of missing episodes
 *   - Modal displays season, episode number, title, and air date
 *
 * Requirements:
 *   - TheTVDB API key must be configured in Settings > 3rd Party APIs
 *   - Only available for TV show libraries (section_type == 'show')
 *   - Only visible to admin users
 *
 * API Endpoints Used:
 *   - get_library_missing_episodes: Gets list of shows with TVDB IDs
 *   - get_show_missing_episodes: Gets missing episodes for a specific show
 *
 * @see plexpy/thetvdb.py - TheTVDB API integration
 * @see plexpy/libraries.py - Backend methods for episode comparison
 */

missing_episodes_table_options = {
    "destroy": true,
    "language": {
        "search": "Search: ",
        "lengthMenu": "Show _MENU_ entries per page",
        "info": "Showing _START_ to _END_ of _TOTAL_ shows",
        "infoEmpty": "Showing 0 to 0 of 0 shows",
        "infoFiltered": "<span class='hidden-md hidden-sm hidden-xs'>(filtered from _MAX_ total entries)</span>",
        "emptyTable": "No shows in library",
        "loadingRecords": '<i class="fa fa-refresh fa-spin"></i> Loading shows...</div>'
    },
    "pagingType": "full_numbers",
    "stateSave": true,
    "stateSaveParams": function (settings, data) {
        data.search.search = "";
        data.start = 0;
    },
    "stateDuration": 0,
    "processing": false,
    "serverSide": false,
    "pageLength": 25,
    "order": [1, 'asc'],
    "autoWidth": false,
    "scrollX": true,
    "columnDefs": [
        {
            "targets": [0],
            "data": "thumb",
            "createdCell": function (td, cellData, rowData, row, col) {
                if (cellData !== '') {
                    $(td).html('<a href="' + page('info', rowData['rating_key']) + '"><div class="info-poster-face" style="background-image: url(' + page('pms_image_proxy', cellData, null, 80, 80) + ');"></div></a>');
                } else {
                    $(td).html('<a href="' + page('info', rowData['rating_key']) + '"><div class="info-poster-face" style="background-image: url(' + page('images', 'poster.png') + ');"></div></a>');
                }
            },
            "orderable": false,
            "searchable": false,
            "width": "40px",
            "className": "poster-face-td"
        },
        {
            "targets": [1],
            "data": "title",
            "createdCell": function (td, cellData, rowData, row, col) {
                if (cellData !== '') {
                    $(td).html('<a href="' + page('info', rowData['rating_key']) + '">' + cellData + '</a>');
                }
            },
            "width": "35%",
            "className": "no-wrap"
        },
        {
            "targets": [2],
            "data": "year",
            "createdCell": function (td, cellData, rowData, row, col) {
                if (cellData !== '') {
                    $(td).html(cellData);
                }
            },
            "width": "6%",
            "className": "no-wrap"
        },
        {
            "targets": [3],
            "data": "episode_count",
            "createdCell": function (td, cellData, rowData, row, col) {
                $(td).html(cellData);
            },
            "width": "8%",
            "className": "no-wrap"
        },
        {
            "targets": [4],
            "data": "thetvdb_id",
            "createdCell": function (td, cellData, rowData, row, col) {
                if (cellData !== null && cellData !== '') {
                    $(td).html('<a href="https://thetvdb.com/dereferrer/series/' + cellData + '" target="_blank">' + cellData + '</a>');
                } else {
                    $(td).html('<span class="text-muted">N/A</span>');
                }
            },
            "width": "8%",
            "className": "no-wrap"
        },
        {
            "targets": [5],
            "data": null,
            "createdCell": function (td, cellData, rowData, row, col) {
                $(td).html('<span class="missing-status text-muted">Not checked</span>');
                $(td).attr('data-rating-key', rowData['rating_key']);
            },
            "width": "15%",
            "className": "no-wrap missing-status-cell",
            "orderable": false,
            "searchable": false
        },
        {
            "targets": [6],
            "data": null,
            "createdCell": function (td, cellData, rowData, row, col) {
                if (rowData['thetvdb_id']) {
                    $(td).html('<button class="btn btn-xs btn-dark check-missing-btn" data-rating-key="' + rowData['rating_key'] + '"><i class="fa fa-search fa-fw"></i> Check</button>');
                } else {
                    $(td).html('<span class="text-muted">-</span>');
                }
            },
            "width": "10%",
            "className": "no-wrap",
            "orderable": false,
            "searchable": false
        }
    ],
    "drawCallback": function (settings) {
        $('#ajaxMsg').fadeOut();
        $('body').tooltip({
            selector: '[data-toggle="tooltip"]',
            container: 'body'
        });
    },
    "preDrawCallback": function(settings) {
        var msg = "<i class='fa fa-refresh fa-spin'></i>&nbsp; Fetching shows...";
        showMsg(msg, false, false, 0);
    }
};

// Handle check button clicks
$('.missing_episodes_table').on('click', 'button.check-missing-btn', function (e) {
    e.preventDefault();
    var btn = $(this);
    var ratingKey = btn.data('rating-key');
    var row = btn.closest('tr');
    var statusCell = row.find('.missing-status-cell');

    // Disable button and show loading
    btn.prop('disabled', true);
    btn.html('<i class="fa fa-spinner fa-spin fa-fw"></i> Checking...');
    statusCell.find('.missing-status').html('<i class="fa fa-spinner fa-spin"></i> Checking...');

    $.ajax({
        url: 'get_show_missing_episodes',
        type: 'GET',
        data: { rating_key: ratingKey },
        dataType: 'json',
        success: function(response) {
            if (response.result === 'success') {
                var data = response.data;
                var missingCount = data.missing_episodes.length;

                if (missingCount === 0) {
                    statusCell.find('.missing-status').html('<span class="text-success"><i class="fa fa-check"></i> Complete</span>');
                    btn.html('<i class="fa fa-check fa-fw"></i> Complete');
                    btn.removeClass('btn-dark').addClass('btn-success');
                } else {
                    statusCell.find('.missing-status').html('<span class="text-warning"><i class="fa fa-exclamation-triangle"></i> Missing: ' + missingCount + '</span>');
                    btn.html('<i class="fa fa-list fa-fw"></i> View (' + missingCount + ')');
                    btn.removeClass('btn-dark').addClass('btn-warning');
                    btn.removeClass('check-missing-btn').addClass('view-missing-btn');

                    // Store the missing episodes data for viewing
                    btn.data('missing-episodes', data.missing_episodes);
                    btn.data('show-title', data.show_info.title);
                }
            } else {
                statusCell.find('.missing-status').html('<span class="text-danger"><i class="fa fa-exclamation-circle"></i> Error</span>');
                btn.html('<i class="fa fa-exclamation-circle fa-fw"></i> Error');
                btn.removeClass('btn-dark').addClass('btn-danger');
                btn.attr('data-toggle', 'tooltip');
                btn.attr('title', response.message || 'Unknown error');
                btn.tooltip();
            }
            btn.prop('disabled', false);
        },
        error: function(xhr, status, error) {
            statusCell.find('.missing-status').html('<span class="text-danger"><i class="fa fa-exclamation-circle"></i> Error</span>');
            btn.html('<i class="fa fa-refresh fa-fw"></i> Retry');
            btn.prop('disabled', false);
        }
    });
});

// Handle view missing episodes button clicks
$('.missing_episodes_table').on('click', 'button.view-missing-btn', function (e) {
    e.preventDefault();
    var btn = $(this);
    var missingEpisodes = btn.data('missing-episodes');
    var showTitle = btn.data('show-title');

    if (!missingEpisodes || missingEpisodes.length === 0) {
        return;
    }

    // Build modal content with Tautulli-compatible dark theme styling
    var modalContent = '<div class="modal fade" id="missing-episodes-modal" tabindex="-1" role="dialog">';
    modalContent += '<div class="modal-dialog modal-lg" role="document">';
    modalContent += '<div class="modal-content">';
    modalContent += '<div class="modal-header">';
    modalContent += '<button type="button" class="close" data-dismiss="modal" aria-label="Close"><i class="fa fa-remove"></i></button>';
    modalContent += '<h4 class="modal-title"><i class="fa fa-exclamation-triangle"></i> Missing Episodes - ' + showTitle + ' (' + missingEpisodes.length + ')</h4>';
    modalContent += '</div>';
    modalContent += '<div class="modal-body" style="padding: 0;">';
    modalContent += '<table style="width: 100%; border-collapse: collapse;">';
    modalContent += '<thead><tr style="background-color: #282828;">';
    modalContent += '<th style="width: 80px; padding: 10px; text-align: center; color: #eee; border-bottom: 1px solid #444;">Season</th>';
    modalContent += '<th style="width: 80px; padding: 10px; text-align: center; color: #eee; border-bottom: 1px solid #444;">Episode</th>';
    modalContent += '<th style="padding: 10px; text-align: left; color: #eee; border-bottom: 1px solid #444;">Title</th>';
    modalContent += '<th style="width: 120px; padding: 10px; text-align: center; color: #eee; border-bottom: 1px solid #444;">Air Date</th>';
    modalContent += '</tr></thead>';
    modalContent += '<tbody>';

    for (var i = 0; i < missingEpisodes.length; i++) {
        var ep = missingEpisodes[i];
        var rowBg = (i % 2 === 0) ? 'rgba(255,255,255,0.035)' : 'rgba(255,255,255,0.010)';
        modalContent += '<tr style="background-color: ' + rowBg + ';">';
        modalContent += '<td style="padding: 8px; text-align: center; color: #eee;">' + ep.season_number + '</td>';
        modalContent += '<td style="padding: 8px; text-align: center; color: #eee;">' + ep.episode_number + '</td>';
        modalContent += '<td style="padding: 8px; text-align: left; color: #eee;">' + (ep.episode_name || 'N/A') + '</td>';
        modalContent += '<td style="padding: 8px; text-align: center; color: #aaa;">' + (ep.air_date || 'N/A') + '</td>';
        modalContent += '</tr>';
    }

    modalContent += '</tbody></table>';
    modalContent += '</div>';
    modalContent += '<div class="modal-footer">';
    modalContent += '<button type="button" class="btn btn-dark" data-dismiss="modal">Close</button>';
    modalContent += '</div></div></div></div>';

    // Remove any existing modal
    $('#missing-episodes-modal').remove();

    // Add and show modal
    $('body').append(modalContent);
    $('#missing-episodes-modal').modal('show');

    // Clean up when modal is hidden
    $('#missing-episodes-modal').on('hidden.bs.modal', function () {
        $(this).remove();
    });
});
