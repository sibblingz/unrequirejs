(function () {

unrequire['definePlugin']("Spaceport SWF", function (un) {
    var parseUri = un['parseUri'];
    var buildUri = un['buildUri'];

    function buildUriFromHash(uri) {
        return buildUri(
            uri['protocol'],
            uri['authority'],
            uri['path'],
            uri['query'],
            uri['anchor']
        );
    }

    function buildUriFromHashWithoutAnchor(uri) {
        return buildUri(
            uri['protocol'],
            uri['authority'],
            uri['path'],
            uri['query']
        );
    }

    function makeErrorEventHandler(messagePrefix, callback) {
        return function on_error(event) {
            event['target']['removeEventListener'](event['type'], on_error);
            callback(new Error(messagePrefix + event.text));
        };
    }

    function fetchWithLoader(resourceType, resourceID, symbolData, sp, callback) {
        var url = buildUriFromHashWithoutAnchor(symbolData.uri);

        var Loader = sp['Loader'];
        var URLRequest = sp['URLRequest'];
        if (typeof Loader !== 'function' || typeof URLRequest !== 'function') {
            callback(new Error("Spaceport not initialized"));
            return;
        }

        var loader = new Loader();
        var cli = loader['contentLoaderInfo'];
        cli['addEventListener']('complete', function on_complete(event) {
            cli['removeEventListener']('complete', on_complete);
            un['push'](resourceID, loader);
            callback(null);
        });

        var errorPrefix = "Failed to load " + resourceType + " " + resourceID + ": ";
        cli['addEventListener']('ioError', makeErrorEventHandler(errorPrefix, callback));

        loader['load'](new URLRequest(url));
    }

    var typeHandlers = {
        'DisplayObject': {
            fetchResource: function DisplayObject_fetchResource(resourceID, symbolData, sp, callback) {
                return fetchWithLoader("DisplayObject", resourceID, symbolData, sp, callback);
            },
            extractModule: function DisplayObject_extractModule(loader, symbolData, callback) {
                if (symbolData.symbol) {
                    var appDomain = loader['contentLoaderInfo']['applicationDomain'];
                    callback(null, appDomain['getDefinition'](symbolData.symbol));
                } else {
                    callback(null, loader['content']);
                }
            }
        },

        'Sound': {
            fetchResource: function Sound_fetchResource(resourceID, symbolData, sp, callback) {
                var url = buildUriFromHashWithoutAnchor(symbolData.uri);

                var Sound = sp['Sound'];
                var URLRequest = sp['URLRequest'];
                if (typeof Sound !== 'function' || typeof URLRequest !== 'function') {
                    callback(new Error("Spaceport not initialized"));
                    return;
                }

                var sound = new Sound();
                sound['addEventListener']('complete', function on_complete(event) {
                    sound['removeEventListener']('complete', on_complete);

                    un['push'](resourceID, sound);
                    callback(null);
                });

                var errorPrefix = "Failed to load Sound " + url + ": ";
                sound['addEventListener']('ioError', makeErrorEventHandler(errorPrefix, callback));

                sound['load'](new URLRequest(url));
            },
            extractModule: function Sound_extractModule(sound, symbolData, callback) {
                // HACK
                function SoundSubclass() {
                    return sound;
                }
                callback(null, SoundSubclass);
            }
        },

        'Bitmap': {
            fetchResource: function Bitmap_fetchResource(resourceID, symbolData, sp, callback) {
                return fetchWithLoader("Bitmap", resourceID, symbolData, sp, callback)
            },
            extractModule: function Bitmap_extractModule(loader, symbolData, callback) {
                var sp = window['sp'];
                var originalBitmapData = loader['content']['bitmapData'];
                var BitmapSubclass = sp['Class']['create'](symbolData.uri.path, sp['Bitmap'], {
                    'constructor': function() {
                        var bitmapData = new sp['BitmapData'](
                            originalBitmapData['width'],
                            originalBitmapData['height'],
                            originalBitmapData['transparent']
                        );
                        bitmapData['copyPixels'](
                            originalBitmapData,
                            originalBitmapData['rect'],
                            new sp['Point'](0, 0)
                        );
                        sp['Bitmap'].call(this, bitmapData);
                    }
                });
                callback(null, BitmapSubclass);
            }
        },

        'ByteArray': {
            fetchResource: function ByteArray_fetchResource(resourceID, symbolData, sp, callback) {
                var url = buildUriFromHashWithoutAnchor(symbolData.uri);

                var URLLoader = sp['URLLoader'];
                var URLRequest = sp['URLRequest'];
                if (typeof URLLoader !== 'function' || typeof URLRequest !== 'function') {
                    callback(new Error("Spaceport not initialized"));
                    return;
                }

                var urlLoader = new URLLoader();
                urlLoader['addEventListener']('complete', function on_complete(event) {
                    urlLoader['removeEventListener']('complete', on_complete);
                    un['push'](resourceID, urlLoader);
                    callback(null);
                });

                var errorPrefix = "Failed to load ByteArray " + resourceID + ": ";
                urlLoader['addEventListener']('ioError', makeErrorEventHandler(errorPrefix, callback));

                urlLoader['dataFormat'] = "binary";
                urlLoader['load'](new URLRequest(url));
            },
            extractModule: function ByteArray_extractModule(urlLoader, symbolData, callback) {
                var sp = window['sp'];
                var ByteArraySubclass = sp['Class']['create'](symbolData.uri.path, sp['ByteArray'], {
                    'constructor': function() {
                        sp['ByteArray'].call(this);
                        this.writeBytes(urlLoader['data']);
                        this.position = 0;
                    }
                });
                callback(null, ByteArraySubclass);
            }
        }
    };

    function uriSymbolData(string) {
        var uri = parseUri(string);
        var symbolAndType = uri['anchor'].split('@');
        var symbol = symbolAndType[0] || null;
        var type = symbolAndType[1] || null;
        if (!type) {
            var extensions = uri['file'].split('.').slice(1);
            if (extensions[extensions.length - 1] === 'swf') {
                type = 'DisplayObject';
            }
        }
        uri['anchor'] = '@' + type;
        return {
            symbol: symbol,
            type: type,
            uri: uri
        };
    }

    return {
        // getResourceID :: ModuleName -> Maybe ResourceID
        'getResourceID': function getResourceID(moduleName) {
            var symbolData = uriSymbolData(moduleName);
            if (!Object.prototype.hasOwnProperty.call(typeHandlers, symbolData.type)) {
                return null;
            }
            return buildUriFromHash(symbolData.uri);
        },

        // fetchResource
        //   :: ResourceID
        //   -> Configuration
        //   -> Callback ()
        //   -> IO ()
        'fetchResource': function fetchResource(resourceID, config, callback) {
            var global = (function () { return this; }());
            var sp = global && global['sp'];
            if (!sp) {
                callback(new Error("Spaceport not initialized; sp object not found on window"));
                return;
            }

            var symbolData = uriSymbolData(resourceID);
            typeHandlers[symbolData.type].fetchResource(resourceID, symbolData, sp, callback);
        },

        // extractModule :: Object -> ModuleName -> Callback Object -> IO ()
        'extractModule': function extractModule(data, moduleName, callback) {
            var symbolData = uriSymbolData(moduleName);
            try {
                typeHandlers[symbolData.type].extractModule(data, symbolData, callback);
            } catch (e) {
                callback(e);
            }
        }
    };
});

}());
