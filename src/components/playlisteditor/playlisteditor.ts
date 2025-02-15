import { BaseItemKind } from '@jellyfin/sdk/lib/generated-client/models/base-item-kind';
import { ItemSortBy } from '@jellyfin/sdk/lib/generated-client/models/item-sort-by';
import { getItemsApi } from '@jellyfin/sdk/lib/utils/api/items-api';
import { getPlaylistsApi } from '@jellyfin/sdk/lib/utils/api/playlists-api';
import { getUserLibraryApi } from '@jellyfin/sdk/lib/utils/api/user-library-api';
import escapeHtml from 'escape-html';

import toast from 'components/toast/toast';
import dom from 'scripts/dom';
import globalize from 'lib/globalize';
import { currentSettings as userSettings } from 'scripts/settings/userSettings';
import { PluginType } from 'types/plugin';
import { toApi } from 'utils/jellyfin-apiclient/compat';
import { isBlank } from 'utils/string';

import dialogHelper from '../dialogHelper/dialogHelper';
import loading from '../loading/loading';
import layoutManager from '../layoutManager';
import { playbackManager } from '../playback/playbackmanager';
import { pluginManager } from '../pluginManager';
import { appRouter } from '../router/appRouter';
import ServerConnections from '../ServerConnections';

import 'elements/emby-button/emby-button';
import 'elements/emby-input/emby-input';
import 'elements/emby-button/paper-icon-button-light';
import 'elements/emby-select/emby-select';

import 'material-design-icons-iconfont';
import '../formdialog.scss';

interface DialogElement extends HTMLDivElement {
    playlistId?: string
    submitted?: boolean
}

interface PlaylistEditorOptions {
    items: string[],
    id?: string,
    serverId: string,
    enableAddToPlayQueue?: boolean,
    defaultValue?: string
}

let currentServerId: string;

function onSubmit(this: HTMLElement, e: Event) {
    const panel = dom.parentWithClass(this, 'dialog') as DialogElement | null;

    if (panel) {
        const playlistCard = panel.querySelector('.playlistCard.selected');
        const playlistId = playlistCard ? playlistCard.getAttribute('data-id') : null;

        loading.show();

        if (playlistId) {
            userSettings.set('playlisteditor-lastplaylistid', playlistId);
            addToPlaylist(panel, playlistId)
                .catch(err => {
                    console.error('[PlaylistEditor] Failed to add to playlist %s', playlistId, err);
                    toast(globalize.translate('PlaylistError.AddFailed'));
                })
                .finally(loading.hide);
        } else if (panel.playlistId) {
            updatePlaylist(panel)
                .catch(err => {
                    console.error('[PlaylistEditor] Failed to update to playlist %s', panel.playlistId, err);
                    toast(globalize.translate('PlaylistError.UpdateFailed'));
                })
                .finally(loading.hide);
        } else {
            createPlaylist(panel)
                .catch(err => {
                    console.error('[PlaylistEditor] Failed to create playlist', err);
                    toast(globalize.translate('PlaylistError.CreateFailed'));
                })
                .finally(loading.hide);
        }
    } else {
        console.error('[PlaylistEditor] Dialog element is missing!');
    }

    e.preventDefault();
    return false;
}

function createPlaylist(dlg: DialogElement) {
    const name = dlg.querySelector<HTMLInputElement>('#txtNewPlaylistName')?.value;
    if (isBlank(name)) return Promise.reject(new Error('Playlist name should not be blank'));

    const apiClient = ServerConnections.getApiClient(currentServerId);
    const api = toApi(apiClient);

    const itemIds = dlg.querySelector<HTMLInputElement>('.fldSelectedItemIds')?.value || undefined;

    return getPlaylistsApi(api)
        .createPlaylist({
            createPlaylistDto: {
                Name: name,
                IsPublic: dlg.querySelector<HTMLInputElement>('#chkPlaylistPublic')?.checked,
                Ids: itemIds?.split(','),
                UserId: apiClient.getCurrentUserId()
            }
        })
        .then(result => {
            dlg.submitted = true;
            dialogHelper.close(dlg);

            redirectToPlaylist(result.data.Id);
        });
}

function redirectToPlaylist(id: string | undefined) {
    appRouter.showItem(id, currentServerId);
}

function updatePlaylist(dlg: DialogElement) {
    if (!dlg.playlistId) return Promise.reject(new Error('Missing playlist ID'));

    const name = dlg.querySelector<HTMLInputElement>('#txtNewPlaylistName')?.value;
    if (isBlank(name)) return Promise.reject(new Error('Playlist name should not be blank'));

    const apiClient = ServerConnections.getApiClient(currentServerId);
    const api = toApi(apiClient);

    return getPlaylistsApi(api)
        .updatePlaylist({
            playlistId: dlg.playlistId,
            updatePlaylistDto: {
                Name: name,
                IsPublic: dlg.querySelector<HTMLInputElement>('#chkPlaylistPublic')?.checked
            }
        })
        .then(() => {
            dlg.submitted = true;
            dialogHelper.close(dlg);
        });
}

function addToPlaylist(dlg: DialogElement, id: string) {
    const apiClient = ServerConnections.getApiClient(currentServerId);
    const api = toApi(apiClient);
    const itemIds = dlg.querySelector<HTMLInputElement>('.fldSelectedItemIds')?.value || '';

    if (id === 'queue') {
        playbackManager.queue({
            serverId: currentServerId,
            ids: itemIds.split(',')
        }).catch(err => {
            console.error('[PlaylistEditor] failed to add to queue', err);
        });
        dlg.submitted = true;
        dialogHelper.close(dlg);
        return Promise.resolve();
    }

    return getPlaylistsApi(api)
        .addItemToPlaylist({
            playlistId: id,
            ids: itemIds.split(','),
            userId: apiClient.getCurrentUserId()
        })
        .then(() => {
            dlg.submitted = true;
            dialogHelper.close(dlg);
        });
}

function populatePlaylists(editorOptions: PlaylistEditorOptions, panel: DialogElement) {
    const grid = panel.querySelector<HTMLDivElement>('#playlistGrid');

    if (!grid) {
        return Promise.reject(new Error('Playlist grid element is missing'));
    }

    loading.show();

    panel.querySelector('.newPlaylistInfo')?.classList.add('hide');

    const apiClient = ServerConnections.getApiClient(currentServerId);
    const api = toApi(apiClient);
    const SyncPlay = pluginManager.firstOfType(PluginType.SyncPlay)?.instance;

    return getItemsApi(api)
        .getItems({
            userId: apiClient.getCurrentUserId(),
            includeItemTypes: [ BaseItemKind.Playlist ],
            sortBy: [ ItemSortBy.SortName ],
            recursive: true
        })
        .then(({ data }) => {
            return Promise.all((data.Items || []).map(item => {
                const playlist = {
                    item,
                    permissions: undefined
                };

                if (!item.Id) return playlist;

                return getPlaylistsApi(api)
                    .getPlaylistUser({
                        playlistId: item.Id,
                        userId: apiClient.getCurrentUserId()
                    })
                    .then(({ data: permissions }) => ({
                        ...playlist,
                        permissions
                    }))
                    .catch(err => {
                        console.info('[PlaylistEditor] Failed to fetch playlist permissions', err);
                        return playlist;
                    });
            }));
        })
        .then(playlists => {
            let html = '';

            if ((editorOptions.enableAddToPlayQueue !== false && playbackManager.isPlaying()) || SyncPlay?.Manager.isSyncPlayEnabled()) {
                html += `
                    <div class="playlistCard" data-id="queue">
                        <div class="listItemBody">
                            <div class="listItemBodyText">
                                ${globalize.translate('AddToPlayQueue')}
                            </div>
                        </div>
                    </div>`;
            }

            html += playlists.map(({ item, permissions }) => {
                if (!permissions?.CanEdit) return '';

                return `
                    <div class="playlistCard" data-id="${item.Id}">
                        <div class="listItemBody">
                            <div class="listItemBodyText">
                                ${escapeHtml(item.Name)}
                            </div>
                        </div>
                    </div>`;
            }).join('');

            grid.innerHTML = html;

            // Add click event listeners to grid items
            grid.querySelectorAll('.playlistCard').forEach(card => {
                card.addEventListener('click', () => {
                    // Remove selected class from all cards
                    grid.querySelectorAll('.playlistCard').forEach(c => c.classList.remove('selected'));
                    // Add selected class to clicked card
                    card.classList.add('selected');

                    // Update form visibility
                    const selectedId = card.getAttribute('data-id');
                    const newPlaylistInfo = card.closest('form')?.querySelector('.newPlaylistInfo');
                    const txtNewPlaylistName = card.closest('form')?.querySelector('#txtNewPlaylistName') as HTMLInputElement;

                    if (newPlaylistInfo && txtNewPlaylistName) {
                        if (selectedId) {
                            newPlaylistInfo.classList.add('hide');
                            txtNewPlaylistName.removeAttribute('required');
                        } else {
                            newPlaylistInfo.classList.remove('hide');
                            txtNewPlaylistName.setAttribute('required', 'required');
                        }
                    }
                });
            });

            let defaultValue = editorOptions.defaultValue;
            if (!defaultValue) {
                defaultValue = userSettings.get('playlisteditor-lastplaylistid') || '';
            }

            // Select default playlist if exists
            const defaultCard = grid.querySelector(`.playlistCard[data-id="${defaultValue}"]`);
            if (defaultCard) {
                defaultCard.classList.add('selected');
            }
        });
}

function getEditorHtml(items: string[], options: PlaylistEditorOptions) {
    let html = `
        <style>
            .playlistGrid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
                gap: 1.5em;
                padding: 1em;
            }
            .playlistCard {
                position: relative;
                background: var(--card-background);
                border-radius: 4px;
                overflow: hidden;
                box-shadow: 0 1px 3px rgba(0,0,0,0.12);
                transition: transform 0.2s ease, box-shadow 0.2s ease;
                cursor: pointer;
                padding: 1em;
            }
            .playlistCard.selected {
                border: 2px solid var(--accent-color);
                transform: translateY(-2px);
                box-shadow: 0 4px 6px rgba(0,0,0,0.15);
            }
        </style>
        <div class="formDialogContent smoothScrollY" style="padding-top:2em;">
            <div class="dialogContentInner dialog-content-centered">
                <form style="margin:auto;">
                    <div class="playlistGrid" id="playlistGrid"></div>
                    <div class="newPlaylistInfo">
                        <div class="inputContainer">
                            <input is="emby-input" type="text" id="txtNewPlaylistName"
                                required="required" label="${globalize.translate('LabelName')}"
                                ${items.length ? '' : 'autofocus'}/>
                        </div>
                    </div>
                    <div class="checkboxContainer checkboxContainer-withDescription">
                        <label>
                            <input type="checkbox" is="emby-checkbox" id="chkPlaylistPublic" />
                            <span>${globalize.translate('PlaylistPublic')}</span>
                        </label>
                        <div class="fieldDescription checkboxFieldDescription">
                            ${globalize.translate('PlaylistPublicDescription')}
                        </div>
                    </div>
                    <div class="formDialogFooter">
                        <button is="emby-button" type="submit" class="raised btnSubmit block formDialogFooterItem button-submit">
                            ${options.id ? globalize.translate('Save') : globalize.translate('Add')}
                        </button>
                    </div>
                    <input type="hidden" class="fldSelectedItemIds" />
                </form>
            </div>
        </div>
    `;

    return html;
}

function initEditor(content: DialogElement, options: PlaylistEditorOptions, items: string[]) {
    content.querySelector('form')?.addEventListener('submit', onSubmit);

    const selectedItemsInput = content.querySelector<HTMLInputElement>('.fldSelectedItemIds');
    if (selectedItemsInput) {
        selectedItemsInput.value = items.join(',');
    }

    if (items.length) {
        populatePlaylists(options, content)
            .catch(err => {
                console.error('[PlaylistEditor] failed to populate playlists', err);
            })
            .finally(loading.hide);
    } else if (options.id) {
        const panel = dom.parentWithClass(content, 'dialog') as DialogElement | null;
        if (!panel) {
            console.error('[PlaylistEditor] could not find dialog element');
            return;
        }

        const apiClient = ServerConnections.getApiClient(currentServerId);
        const api = toApi(apiClient);
        Promise.all([
            getUserLibraryApi(api)
                .getItem({ itemId: options.id }),
            getPlaylistsApi(api)
                .getPlaylist({ playlistId: options.id })
        ])
            .then(([ { data: playlistItem }, { data: playlist } ]) => {
                panel.playlistId = options.id;

                const nameField = panel.querySelector<HTMLInputElement>('#txtNewPlaylistName');
                if (nameField) nameField.value = playlistItem.Name || '';

                const publicField = panel.querySelector<HTMLInputElement>('#chkPlaylistPublic');
                if (publicField) publicField.checked = !!playlist.OpenAccess;
            })
            .catch(err => {
                console.error('[playlistEditor] failed to get playlist details', err);
            });
    }
}

export class PlaylistEditor {
    show(options: PlaylistEditorOptions) {
        const items = options.items || [];
        currentServerId = options.serverId;

        const dialogOptions = {
            removeOnClose: true,
            scrollY: false,
            size: layoutManager.tv ? 'fullscreen' : 'small'
        };

        const dlg: DialogElement = dialogHelper.createDialog(dialogOptions);

        dlg.classList.add('formDialog');

        let html = '';
        html += '<div class="formDialogHeader">';
        html += `<button is="paper-icon-button-light" class="btnCancel autoSize" tabindex="-1" title="${globalize.translate('ButtonBack')}"><span class="material-icons arrow_back" aria-hidden="true"></span></button>`;
        html += '<h3 class="formDialogHeaderTitle">';
        if (items.length) {
            html += globalize.translate('HeaderAddToPlaylist');
        } else if (options.id) {
            html += globalize.translate('HeaderEditPlaylist');
        } else {
            html += globalize.translate('HeaderNewPlaylist');
        }
        html += '</h3>';

        html += '</div>';

        html += getEditorHtml(items, options);

        dlg.innerHTML = html;

        initEditor(dlg, options, items);

        dlg.querySelector('.btnCancel')?.addEventListener('click', () => {
            dialogHelper.close(dlg);
        });

        return dialogHelper.open(dlg).then(() => {
            if (dlg.submitted) {
                return Promise.resolve();
            }

            return Promise.reject(new Error());
        });
    }
}

export default PlaylistEditor;
