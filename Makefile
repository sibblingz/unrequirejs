.PHONY: all commit amdjs-tests

define ensure_buildable
	@mkdir -p $(dir $1)
endef

all: dist/unrequire.js

commit: dist/unrequire.js
	git add $^

BUILD_FILES = build/build.sh Makefile
UNREQUIRE_JS = lib/unrequire.js

ALL_PLUGINS = \
	lib/browser.js \
	lib/commonjs.js

#	lib/node.js \
#	lib/spaceport.js

dist/unrequire.js: $(BUILD_FILES) $(UNREQUIRE_JS) $(ALL_PLUGINS)
	build/build.sh --output $@ --no-compress -- $(ALL_PLUGINS)

####################
# AMD test suite

amdjs-tests: amdjs-tests/impl/unrequire

amdjs-tests/impl/unrequire: amdjs-tests/impl/unrequire/unrequire.js amdjs-tests/impl/unrequire/config.js

AMD_PLUGINS = \
	lib/browser.js \
	lib/commonjs.js

amdjs-tests/impl/unrequire/unrequire.js: $(BUILD_FILES) $(UNREQUIRE_JS) $(AMD_PLUGINS)
	$(call ensure_buildable,$@)
	build/build.sh --output $@ --no-compress -- $(AMD_PLUGINS)

amdjs-tests/impl/unrequire/config.js: tests/amd-config.js
	$(call ensure_buildable,$@)
	cp $< $@