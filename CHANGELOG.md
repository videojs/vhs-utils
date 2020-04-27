<a name="2.1.0"></a>
# [2.1.0](https://github.com/videojs/stream/compare/v2.0.0...v2.1.0) (2020-04-27)

### Features

* Add functions for byte manipulation and segment container detection (#12) ([325f677](https://github.com/videojs/stream/commit/325f677)), closes [#12](https://github.com/videojs/stream/issues/12)

<a name="2.0.0"></a>
# [2.0.0](https://github.com/videojs/stream/compare/v1.3.0...v2.0.0) (2020-04-07)

### Features

* **codec:** changes to handle muxer/browser/video/audio support separately (#10) ([1f92865](https://github.com/videojs/stream/commit/1f92865)), closes [#10](https://github.com/videojs/stream/issues/10)

### Bug Fixes

* Allow VP9 and AV1 codecs through in VHS ([b32e35b](https://github.com/videojs/stream/commit/b32e35b))


### BREAKING CHANGES

* **codec:** parseCodecs output has been changed. It now returns an object that can have an audio or video property, depending on the codecs found. Those properties are object that contain type. and details. Type being the codec name and details being codec specific information usually with a leading period.
* **codec:** `audioProfileFromDefault` has been renamed to `codecsFromDefault` and now returns all output from `parseCodecs` not just audio or audio profile.

<a name="1.3.0"></a>
# [1.3.0](https://github.com/videojs/vhs-utils/compare/v1.2.1...v1.3.0) (2020-02-05)

### Features

* add forEachMediaGroup in media-groups module (#8) ([a1eacf4](https://github.com/videojs/vhs-utils/commit/a1eacf4)), closes [#8](https://github.com/videojs/vhs-utils/issues/8)

<a name="1.2.1"></a>
## [1.2.1](https://github.com/videojs/vhs-utils/compare/v1.2.0...v1.2.1) (2020-01-15)

### Bug Fixes

* include videojs in VHS JSON media type (#7) ([da072f0](https://github.com/videojs/vhs-utils/commit/da072f0)), closes [#7](https://github.com/videojs/vhs-utils/issues/7)

<a name="1.2.0"></a>
# [1.2.0](https://github.com/videojs/vhs-utils/compare/v1.1.0...v1.2.0) (2019-12-06)

### Features

* add media-types module with simpleTypeFromSourceType function (#4) ([d3ebd3f](https://github.com/videojs/vhs-utils/commit/d3ebd3f)), closes [#4](https://github.com/videojs/vhs-utils/issues/4)
* add VHS codec parsing and translation functions (#5) ([4fe0e22](https://github.com/videojs/vhs-utils/commit/4fe0e22)), closes [#5](https://github.com/videojs/vhs-utils/issues/5)

<a name="1.1.0"></a>
# [1.1.0](https://github.com/videojs/stream/compare/v1.0.0...v1.1.0) (2019-08-30)

### Features

* node support and more stream tests ([315ab8d](https://github.com/videojs/stream/commit/315ab8d))

<a name="1.0.0"></a>
# 1.0.0 (2019-08-21)

### Features

* clones from mpd-parser, m3u8-parser, mux.js, aes-decrypter, and vhs ([5e89042](https://github.com/videojs/stream/commit/5e89042))

