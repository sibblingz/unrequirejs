TODO list
=========

* Rename `require` global variable to `unrequire`.
  * Use of old `require` will issue compatibility warning.
* Make `unrequire` global variable a non-function; force `unrequire.load`.
  * Use as a function will issue compatibility warning.
* Fix up derequire to handle new formats.
* AMD compliance.
* Allow definition of objects, etc.
* Better minification.
* Allow merging of unrequire and e.g. browser plugin.
* Aliasing.

Environment support
-------------------

* CommonJS support (e.g. `exports` pseudomodule).
* Node.JS plugin.
* Spaceport script loading plugin.
* Webkit cache busting workaround.
* CDN support.
* Rename packages to bundles.

Error reporting
---------------

* Circular references.
* 404.
* Missing or misleading `define`.
