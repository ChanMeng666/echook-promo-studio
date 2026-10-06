import { Config } from "@remotion/cli/config";

// The picture is a UI replica: hairlines and small type. JPEG frames ring
// around exactly that, so frames are PNG.
Config.setVideoImageFormat("png");
Config.setOverwriteOutput(true);
Config.setChromiumOpenGlRenderer("angle");
// Fonts and painted plates load at module scope in every render worker.
Config.setDelayRenderTimeoutInMilliseconds(120_000);
