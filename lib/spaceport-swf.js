(function () {

unrequire['definePlugin']("Spaceport SWF", function (un) {
    var parseUri = un['parseUri'];
    var buildUri = un['buildUri'];

    return {
        // getResourceID :: ModuleName -> Maybe ResourceID
        'getResourceID': function getResourceID(moduleName) {
            var uri = parseUri(moduleName);
            var extensions = uri['file'].split('.').slice(1);
            var path = uri['path'];
            if (extensions[extensions.length - 1] !== 'swf') {
                // Not a .swf file.
                return null;
            }

            return buildUri(
                uri['protocol'],
                uri['authority'],
                uri['path'],
                uri['query']
                /* no anchor */
            );
        },

        // fetchResource
        //   :: ResourceID
        //   -> Configuration
        //   -> Callback ()
        //   -> IO ()
        'fetchResource': function fetchResource(scriptName, config, callback) {
            var sp = window && window.sp;
            if (!sp) {
                callback(new Error("Spaceport not initialized; sp object not found on window"));
                return;
            }

            var Loader = sp.Loader;
            var URLRequest = sp.URLRequest;
            if (typeof Loader !== 'function' || typeof URLRequest !== 'function') {
                callback(new Error("Spaceport not initialized"));
                return;
            }

            var loader = new Loader();
            var cli = loader.contentLoaderInfo;
            cli.addEventListener('complete', function on_complete(event) {
                cli.removeEventListener('complete', on_complete);

                un['push'](scriptName, loader);
                callback(null);
            });

            cli.addEventListener('ioError', function on_error(event) {
                cli.removeEventListener('ioError', on_error);

                callback(new Error("Failed to load " + scriptName + ": " + event.text));
                loader.destroy(true);
            });

            loader.load(new URLRequest(scriptName));
        },

        // extractModule :: Object -> ModuleName -> Callback Object -> IO ()
        'extractModule': function extractModule(loader, moduleName, callback) {
            var uri = parseUri(moduleName);
            var anchor = uri['anchor'];
            if (anchor) {
                try {
                    var appDomain = loader.contentLoaderInfo.applicationDomain;
                    callback(null, appDomain.getDefinition(anchor));
                } catch (e) {
                    callback(e);
                }
            } else {
                callback(null, loader.content);
            }
        }
    };
});

}());
