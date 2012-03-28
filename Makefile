.PHONY: all commit

all: dist/unrequire.js

commit: dist/unrequire.js
	git add $^

BUILD_FILES = build/build.sh Makefile
UNREQUIRE_JS = lib/unrequire.js

ALL_PLUGINS = \
	lib/browser.js \
	lib/node.js \
	lib/spaceport.js

dist/unrequire.js: $(BUILD_FILES) $(UNREQUIRE_JS) $(ALL_PLUGINS)
	build/build.sh --output $@ --no-compress $(ALL_PLUGINS)
