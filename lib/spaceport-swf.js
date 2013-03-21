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

    var typeHandlers = {
        'DisplayObject': {
            fetchResource: function(symbolData, sp, callback) {
                var resourceID = buildUriFromHash(symbolData.uri);

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

                cli['addEventListener']('ioError', function on_error(event) {
                    cli['removeEventListener']('ioError', on_error);

                    callback(new Error("Failed to load " + resourceID + ": " + event.text));
                    loader['destroy'](true);
                });

                loader['load'](new URLRequest(resourceID));
            },
            extractModule: function (loader, symbolData, callback) {
                if (symbolData.symbol) {
                    var appDomain = loader['contentLoaderInfo']['applicationDomain'];
                    callback(null, appDomain['getDefinition'](symbolData.symbol));
                } else {
                    callback(null, loader['content']);
                }
            }
        },
        'Sound': { },  // TODO
        'Bitmap': { },  // TODO
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
        uri['anchor'] = '';
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
            var sp = window && window['sp'];
            if (!sp) {
                callback(new Error("Spaceport not initialized; sp object not found on window"));
                return;
            }

            var symbolData = uriSymbolData(resourceID);
            typeHandlers[symbolData.type].fetchResource(symbolData, sp, callback);
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
