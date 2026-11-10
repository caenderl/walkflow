# Changelog

## [0.2.0](https://github.com/walkflow-app/walkflow/compare/v0.1.0...v0.2.0) (2026-11-10)


### Features

* **desktop:** update the app from inside, with a yes to download and a second yes to restart ([4d7951f](https://github.com/walkflow-app/walkflow/commit/4d7951f0ecbbd03ca239e83a26f30db3c3fd02f6))
* **history:** a date under every day of the chart, in two lines ([609224d](https://github.com/walkflow-app/walkflow/commit/609224ddf57ae19a58301003a1b82a9c53b97ed4))
* **history:** a gear in the corner of the card instead of the backup button ([0247119](https://github.com/walkflow-app/walkflow/commit/0247119658cf4d41ec3eb93f03136f21c5a5e187))
* **history:** show the distance per day for the last 30 days, and mark a run as paused while the belt stands ([4255a39](https://github.com/walkflow-app/walkflow/commit/4255a396deacc56ed82477b93ae82b3e97d3297e))
* **routes:** no privacy notice in the route store, the info dialog says it ([e7ca22e](https://github.com/walkflow-app/walkflow/commit/e7ca22e708275c222119fb946eaaaeb702192cb9))
* **site:** a product page for GitHub Pages with the web app under app/ ([de5f81e](https://github.com/walkflow-app/walkflow/commit/de5f81e13c9a41c3c03234db6ec236bd59e72201))


### Fixes

* **history:** label only the Mondays and today in the daily chart ([da2fa2e](https://github.com/walkflow-app/walkflow/commit/da2fa2ee74135aff568ce906049a8bd6c7a39184))
* **store:** find the app's code from the script's own folder, not from where it is run ([d7b0975](https://github.com/walkflow-app/walkflow/commit/d7b0975f1001069ad3943cb293fdb753b98c20ed))

## [0.1.0](https://github.com/caenderl/walkflow/compare/v0.0.1...v0.1.0) (2026-11-09)


### Safety

* **ble:** give up on a write that never answers, so Stop is not held back for ever ([d79c29d](https://github.com/caenderl/walkflow/commit/d79c29d3a2cd284f8f5e2312a80f434cfc6bacae))
* **program:** stop the belt when a program could not be started ([49d2a4a](https://github.com/caenderl/walkflow/commit/49d2a4abecffe28837a1dbeca3a6484c72795e26))
* **start:** set the lowest speed before Start so the belt does not run up to its remembered speed ([021f5f6](https://github.com/caenderl/walkflow/commit/021f5f6a36c3e3e501a56212b3c5364420448f15))
* **stop:** send Stop again when it does not go through, and read the treadmill's refusals ([64943ba](https://github.com/caenderl/walkflow/commit/64943ba24c20d0e8cd81cd13e44519d4912c8541))


### Features

* **community:** a Community view to find and take routes and workouts from other devices ([fb1be20](https://github.com/caenderl/walkflow/commit/fb1be20d63f723d07f807b98802588e794721d47))
* **community:** share a route or workout with the community from its menu ([5959da2](https://github.com/caenderl/walkflow/commit/5959da2695d1da3a20323c59d77efc509cfbaf7a))
* **desktop:** file icon for .walkflow and open route packages by double click ([9aa22b9](https://github.com/caenderl/walkflow/commit/9aa22b937c3d170ffeb084dd1d7f1cf8b0084e6d))
* **desktop:** hide nameless Bluetooth devices in the chooser ([f1e933d](https://github.com/caenderl/walkflow/commit/f1e933dd202a747bae99367c8fab474c848c1ad5))
* **desktop:** watch mode for development (npm run electron:dev) ([0f3b093](https://github.com/caenderl/walkflow/commit/0f3b093381200bca8d448e65cf70d4202f1e3a4b))
* **i18n:** add Ukrainian ([a9bab25](https://github.com/caenderl/walkflow/commit/a9bab258677c2dc9bb3a22783a8441c26efe269f))
* **incline:** ask the treadmill whether it supports incline, with configurable levels ([c8133df](https://github.com/caenderl/walkflow/commit/c8133df518039d093745c367701732a05fa50c88))
* **incline:** set the number of incline levels instead of their percent ([fb28462](https://github.com/caenderl/walkflow/commit/fb28462bb2cb3e1f549cc37a2f730ccb35d86809))
* **routes:** a route store on GitHub with revisions and waypoints, and Community left out ([6fc74a9](https://github.com/caenderl/walkflow/commit/6fc74a9758d7d7de797ecd480af68ebc29714835))
* **routes:** add example routes for Hamburg, Vienna and Tokyo ([4370126](https://github.com/caenderl/walkflow/commit/4370126f1eeeb9c875f9944bf23f47693628e79b))
* **routes:** example route from OpenStreetMap ([ea989a1](https://github.com/caenderl/walkflow/commit/ea989a1f3fb5979d8d771d26711946735916a168))
* **routes:** GPX routes with progress and elevation profile ([db7b8db](https://github.com/caenderl/walkflow/commit/db7b8db8526f9a7c9ca93b372cff5567700c439e))
* **routes:** optional route map with OpenFreeMap ([94b97d7](https://github.com/caenderl/walkflow/commit/94b97d7560a7d0516a622eb9ba5fbfe554543d4c))
* **routes:** route packages (.walkflow) with name, place and texts in any language ([24576a4](https://github.com/caenderl/walkflow/commit/24576a449f0193e1a58dc8ff8ee00ec2af7dcffd))
* **routes:** show route progress and time left above the map ([4876725](https://github.com/caenderl/walkflow/commit/4876725b744d1f8cb57283b306f1997399eeb10c))
* **routes:** walk a route as a workout, tag runs with what they were ([4592a20](https://github.com/caenderl/walkflow/commit/4592a20eabb7637a5851a74e7173fd2997011b7e))
* **safety:** Start and Pause follow the belt, Stop is never disabled ([7279929](https://github.com/caenderl/walkflow/commit/7279929b94d93b92267f8a1fcca95ba13d0b3c22))
* **settings:** developer mode for the experiment console and the developer tools ([2a8f009](https://github.com/caenderl/walkflow/commit/2a8f00926530e0e575568e414ce8b4d85585f56f))
* **theme:** add the Lagoon and Candy colour palettes ([3f6f8f1](https://github.com/caenderl/walkflow/commit/3f6f8f16eef0c4a0d32137ab2f0cc07c464f2658))
* **ui:** blink the step countdown red in the last 10 seconds ([e90721b](https://github.com/caenderl/walkflow/commit/e90721b48ed93f9c8364816da80be35d603c43ed))
* **ui:** settings dialog, single-choice training view, route library with map, flags and quiet mode ([cea5360](https://github.com/caenderl/walkflow/commit/cea5360fe3250fba050d617c920a84727f8f684e))
* **ui:** status under the speed and a banner for start, stop and connection ([931e3a8](https://github.com/caenderl/walkflow/commit/931e3a897b77490311123b9b78a59ebb37c56f5e))
* **ui:** Walkflow icon on the Start and Use buttons, fixed "Start" label ([ea35efb](https://github.com/caenderl/walkflow/commit/ea35efb0743f8dcac1630c7b5e18cbf0da7dfa15))
* **units:** choose metric or imperial units in the settings ([c209c00](https://github.com/caenderl/walkflow/commit/c209c00d50ccf7ee43234bf7b7053087665eb39b))
* **workouts:** distance steps, workout library and week plan ([69578b0](https://github.com/caenderl/walkflow/commit/69578b08f3d33f1fafee1dcaf6a7870ec0536e64))
* **workouts:** export and import workout packages ([d61ee37](https://github.com/caenderl/walkflow/commit/d61ee37425437fa258398f14f0873503e40ebc91))
* **workouts:** optional step incline and weekday suggestions ([72940ce](https://github.com/caenderl/walkflow/commit/72940ce3283ab061b6a662f82a9f57098fdf8d1e))


### Fixes

* **connect:** keep what the treadmill reports while the connection is set up ([5187a7d](https://github.com/caenderl/walkflow/commit/5187a7df63f9f375f0e5c4895ab62a0fe3282c58))
* **desktop:** serve .mjs files as JavaScript so the map worker loads ([a2235d9](https://github.com/caenderl/walkflow/commit/a2235d90b80dd49cc8171e3deb405d9eaa57e07d))
* **ui:** stop the hidden speed chart from growing on every redraw ([cb0cafa](https://github.com/caenderl/walkflow/commit/cb0cafa0f3017989bdbc47b66df51d8d0edc4469))
