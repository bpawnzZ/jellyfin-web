define(['jQuery', 'loading', 'globalize', 'dom', 'libraryMenu'], function ($, loading, globalize, dom, libraryMenu) {
    'use strict';

    function loadPage(page, config, systemInfo) {
        Array.prototype.forEach.call(page.querySelectorAll('.chkDecodeCodec'), function (c) {
            c.checked = -1 !== (config.HardwareDecodingCodecs || []).indexOf(c.getAttribute('data-codec'));
        });
        page.querySelector('#chkDecodingColorDepth10Hevc').checked = config.EnableDecodingColorDepth10Hevc;
        page.querySelector('#chkDecodingColorDepth10Vp9').checked = config.EnableDecodingColorDepth10Vp9;
        page.querySelector('#chkHardwareEncoding').checked = config.EnableHardwareEncoding;
        page.querySelector('#chkTonemapping').checked = config.EnableTonemapping;
        $('#selectVideoDecoder', page).val(config.HardwareAccelerationType);
        $('#selectThreadCount', page).val(config.EncodingThreadCount);
        $('#txtDownMixAudioBoost', page).val(config.DownMixAudioBoost);
        page.querySelector('.txtEncoderPath').value = config.EncoderAppPathDisplay || '';
        $('#txtTranscodingTempPath', page).val(systemInfo.TranscodingTempPath || '');
        $('#txtVaapiDevice', page).val(config.VaapiDevice || '');
        $('#txtOpenclDevice', page).val(config.OpenclDevice || '');
        $('#selectTonemappingAlgorithm', page).val(config.TonemappingAlgorithm);
        $('#selectTonemappingRange', page).val(config.TonemappingRange);
        $('#txtTonemappingDesat', page).val(config.TonemappingDesat);
        $('#txtTonemappingThreshold', page).val(config.TonemappingThreshold);
        $('#txtTonemappingPeak', page).val(config.TonemappingPeak);
        $('#txtTonemappingParam', page).val(config.TonemappingParam || '');
        page.querySelector('#selectEncoderPreset').value = config.EncoderPreset || '';
        page.querySelector('#txtH264Crf').value = config.H264Crf || '';
        page.querySelector('#selectDeinterlaceMethod').value = config.DeinterlaceMethod || '';
        page.querySelector('#chkEnableSubtitleExtraction').checked = config.EnableSubtitleExtraction || false;
        page.querySelector('#chkEnableThrottling').checked = config.EnableThrottling || false;
        page.querySelector('#selectVideoDecoder').dispatchEvent(new CustomEvent('change', {
            bubbles: true
        }));
        loading.hide();
    }

    function onSaveEncodingPathFailure(response) {
        loading.hide();
        var msg = '';
        msg = globalize.translate('FFmpegSavePathNotFound');

        require(['alert'], function (alert) {
            alert(msg);
        });
    }

    function updateEncoder(form) {
        return ApiClient.getSystemInfo().then(function (systemInfo) {
            return ApiClient.ajax({
                url: ApiClient.getUrl('System/MediaEncoder/Path'),
                type: 'POST',
                data: {
                    Path: form.querySelector('.txtEncoderPath').value,
                    PathType: 'Custom'
                }
            }).then(Dashboard.processServerConfigurationUpdateResult, onSaveEncodingPathFailure);
        });
    }

    function onSubmit() {
        var form = this;

        var onDecoderConfirmed = function () {
            loading.show();
            ApiClient.getNamedConfiguration('encoding').then(function (config) {
                config.DownMixAudioBoost = $('#txtDownMixAudioBoost', form).val();
                config.TranscodingTempPath = $('#txtTranscodingTempPath', form).val();
                config.EncodingThreadCount = $('#selectThreadCount', form).val();
                config.HardwareAccelerationType = $('#selectVideoDecoder', form).val();
                config.VaapiDevice = $('#txtVaapiDevice', form).val();
                config.OpenclDevice = $('#txtOpenclDevice', form).val();
                config.EnableTonemapping = form.querySelector('#chkTonemapping').checked;
                config.TonemappingAlgorithm = form.querySelector('#selectTonemappingAlgorithm').value;
                config.TonemappingRange = form.querySelector('#selectTonemappingRange').value;
                config.TonemappingDesat = $('#txtTonemappingDesat', form).val();
                config.TonemappingThreshold = $('#txtTonemappingThreshold', form).val();
                config.TonemappingPeak = $('#txtTonemappingPeak', form).val();
                config.TonemappingParam = $('#txtTonemappingParam', form).val();
                config.EncoderPreset = form.querySelector('#selectEncoderPreset').value;
                config.H264Crf = parseInt(form.querySelector('#txtH264Crf').value || '0');
                config.DeinterlaceMethod = form.querySelector('#selectDeinterlaceMethod').value;
                config.EnableSubtitleExtraction = form.querySelector('#chkEnableSubtitleExtraction').checked;
                config.EnableThrottling = form.querySelector('#chkEnableThrottling').checked;
                config.HardwareDecodingCodecs = Array.prototype.map.call(Array.prototype.filter.call(form.querySelectorAll('.chkDecodeCodec'), function (c) {
                    return c.checked;
                }), function (c) {
                    return c.getAttribute('data-codec');
                });
                config.EnableDecodingColorDepth10Hevc = form.querySelector('#chkDecodingColorDepth10Hevc').checked;
                config.EnableDecodingColorDepth10Vp9 = form.querySelector('#chkDecodingColorDepth10Vp9').checked;
                config.EnableHardwareEncoding = form.querySelector('#chkHardwareEncoding').checked;
                ApiClient.updateNamedConfiguration('encoding', config).then(function () {
                    updateEncoder(form);
                }, function () {
                    require(['alert'], function (alert) {
                        alert(globalize.translate('DefaultErrorMessage'));
                    });

                    Dashboard.processServerConfigurationUpdateResult();
                });
            });
        };

        if ($('#selectVideoDecoder', form).val()) {
            require(['alert'], function (alert) {
                alert({
                    title: globalize.translate('TitleHardwareAcceleration'),
                    text: globalize.translate('HardwareAccelerationWarning')
                }).then(onDecoderConfirmed);
            });
        } else {
            onDecoderConfirmed();
        }

        return false;
    }

    function setDecodingCodecsVisible(context, value) {
        value = value || '';
        var any;
        Array.prototype.forEach.call(context.querySelectorAll('.chkDecodeCodec'), function (c) {
            if (-1 === c.getAttribute('data-types').split(',').indexOf(value)) {
                dom.parentWithTag(c, 'LABEL').classList.add('hide');
            } else {
                dom.parentWithTag(c, 'LABEL').classList.remove('hide');
                any = true;
            }
        });

        if (any) {
            context.querySelector('.decodingCodecsList').classList.remove('hide');
        } else {
            context.querySelector('.decodingCodecsList').classList.add('hide');
        }
    }

    function getTabs() {
        return [{
            href: 'encodingsettings.html',
            name: globalize.translate('Transcoding')
        }, {
            href: 'playbackconfiguration.html',
            name: globalize.translate('TabResumeSettings')
        }, {
            href: 'streamingsettings.html',
            name: globalize.translate('TabStreaming')
        }];
    }

    $(document).on('pageinit', '#encodingSettingsPage', function () {
        var page = this;
        page.querySelector('#selectVideoDecoder').addEventListener('change', function () {
            if ('vaapi' == this.value) {
                page.querySelector('.fldVaapiDevice').classList.remove('hide');
                page.querySelector('#txtVaapiDevice').setAttribute('required', 'required');
            } else {
                page.querySelector('.fldVaapiDevice').classList.add('hide');
                page.querySelector('#txtVaapiDevice').removeAttribute('required');
            }

            if ('nvenc' == this.value) {
                page.querySelector('.fldOpenclDevice').classList.remove('hide');
                page.querySelector('#txtOpenclDevice').setAttribute('required', 'required');
                page.querySelector('.tonemappingOptions').classList.remove('hide');
            } else {
                page.querySelector('.fldOpenclDevice').classList.add('hide');
                page.querySelector('#txtOpenclDevice').removeAttribute('required');
                page.querySelector('.tonemappingOptions').classList.add('hide');
            }

            if (this.value) {
                page.querySelector('.hardwareAccelerationOptions').classList.remove('hide');
            } else {
                page.querySelector('.hardwareAccelerationOptions').classList.add('hide');
            }

            setDecodingCodecsVisible(page, this.value);
        });
        $('#btnSelectEncoderPath', page).on('click.selectDirectory', function () {
            require(['directorybrowser'], function (directoryBrowser) {
                var picker = new directoryBrowser();
                picker.show({
                    includeFiles: true,
                    callback: function (path) {
                        if (path) {
                            $('.txtEncoderPath', page).val(path);
                        }

                        picker.close();
                    }
                });
            });
        });
        $('#btnSelectTranscodingTempPath', page).on('click.selectDirectory', function () {
            require(['directorybrowser'], function (directoryBrowser) {
                var picker = new directoryBrowser();
                picker.show({
                    callback: function (path) {
                        if (path) {
                            $('#txtTranscodingTempPath', page).val(path);
                        }

                        picker.close();
                    },
                    validateWriteable: true,
                    header: globalize.translate('HeaderSelectTranscodingPath'),
                    instruction: globalize.translate('HeaderSelectTranscodingPathHelp')
                });
            });
        });
        $('.encodingSettingsForm').off('submit', onSubmit).on('submit', onSubmit);
    }).on('pageshow', '#encodingSettingsPage', function () {
        loading.show();
        libraryMenu.setTabs('playback', 0, getTabs);
        var page = this;
        ApiClient.getNamedConfiguration('encoding').then(function (config) {
            ApiClient.getSystemInfo().then(function (systemInfo) {
                loadPage(page, config, systemInfo);
            });
        });
    });
});
