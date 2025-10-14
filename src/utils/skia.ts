import { Skia } from "@shopify/react-native-skia";
import type { SkCanvas, SkPicture } from "@shopify/react-native-skia";

/**
 * Records the result of imperative Skia draw calls into a reusable picture.
 *
 * Re-rendering complex vector scenes is one of the largest cold-start costs in
 * this project. By pre-recording the static portions of each dial we can
 * effectively "pre-bake" textures that Skia can reuse across frames without
 * recalculating the entire scene graph.
 */
export const recordPicture = (
  width: number,
  height: number,
  draw: (canvas: SkCanvas) => void,
): SkPicture => {
  const recorder = Skia.PictureRecorder();
  const canvas = recorder.beginRecording(Skia.XYWHRect(0, 0, width, height));

  draw(canvas);

  return recorder.finishRecordingAsPicture();
};

