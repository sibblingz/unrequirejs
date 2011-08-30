# UNREQUIRE.JS IS CURRENTLY UNSTABLE.  DO NOT USE IT IN PRODUCTION SYSTEMS!

# Unrequire.JS

Unrequire.JS is a module definition and inclusion system.  It **partially**
implements the [AMD JS specification][1].

## Module resolution

Unrequire.JS maintains two pieces of information required to resolve module
names.  The base path determines the "root" of a project.  The current directory
determines how explicitly relative module names are resolved.

### Example

The module resolution system is best explained through example.  Say we have the
base path and current directory:

    base path = http://example.com/js/
    current directory = (empty)

Let's include a module located in `http://example.com/js/main.js`.  It looks
like this:

    define(function () { alert("Hello, world!"); });

There are three ways we can include this module.

1. `require([ "main" ])`
2. `require([ "./main" ])`
3. `require([ "/js/main" ])`

Option 1 is the recommended method.  It concatenates the base path and the module
name to locate the script.  In this case, `http://example.com/js/ ++ main =
http://example.com/js/main`.  The `.js` extension is automatically included,
resulting in the desired `http://example.com/js/main.js`.

Option 2 is an alternative method.  It concatenates the base path, the current
directory, and the module name.  Options 2 is triggered when a path begins with
`./` or `../`.  In this case, `http://example.com/js/ ++ (empty) ++ main =
http://example.com/js/main`.  The `.js` extension is inserted, as with option 1.

Option 3 is discouraged, as it depends on the location of the module script on
the file system or web server.  Option 3 is triggered when a path begins with a
`"/"`.

[1]: https://github.com/amdjs/amdjs-api/wiki/AMD
