/**
 * rice-model.js
 * -----------------------------------------------------------------------
 * A pure-JS port of the REAL trained models shipped in training_testing/
 * (scikit-learn GradientBoostingClassifier). Two variants, both exported
 * the same way (see training_testing/export_model_to_json.py):
 *
 *   - model-data-rgb-only.json  — trained on 18 RGB/HSV/texture features
 *     only, no NIR. 83.13% test accuracy. This is the DEFAULT used for a
 *     live photo upload (predictFromCanvas), because there's no real NIR
 *     band to work with for a photo someone just took.
 *   - model-data.json — the full 32-feature RGB+Pseudo-NIR fusion model,
 *     85.74% test accuracy. Used via predictFromCanvasFusion() when a
 *     REAL paired Pseudo-NIR image exists (e.g. the bundled dataset).
 *
 * Given the same feature vector, this reproduces the same class
 * probabilities as the Python model (validated against
 * training_testing/predict_sample.py output — see js/ml/README.md).
 *
 * Earlier versions of this file tried to synthesize a fake Pseudo-NIR
 * band from an RGB photo and feed it to the fusion model. That's been
 * removed: the RGB-only model above is a properly-trained alternative
 * (validated in the training notebook, not a guess) and avoids the
 * accuracy loss that came from approximating NIR. See js/ml/README.md
 * for the full history and numbers.
 */

(function (root) {
  'use strict';

  // ---------------------------------------------------------------------
  // 1. Colour-space helpers (ported from OpenCV's exact formulas so the
  //    numbers line up with what the model was trained on)
  // ---------------------------------------------------------------------

  // cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY): Y = 0.299R + 0.587G + 0.114B
  function rgbToGray(r, g, b) {
    return Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  }

  // cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV) for 8-bit images: H in [0,179],
  // S,V in [0,255]. Input r,g,b in [0,255].
  function rgbToHsv8(r, g, b) {
    const rf = r / 255, gf = g / 255, bf = b / 255;
    const maxc = Math.max(rf, gf, bf);
    const minc = Math.min(rf, gf, bf);
    const delta = maxc - minc;
    const v = maxc;
    const s = maxc === 0 ? 0 : delta / maxc;
    let h = 0;
    if (delta !== 0) {
      if (maxc === rf) h = 60 * (((gf - bf) / delta) % 6);
      else if (maxc === gf) h = 60 * ((bf - rf) / delta + 2);
      else h = 60 * ((rf - gf) / delta + 4);
      if (h < 0) h += 360;
    }
    const h8 = Math.round(h / 2);
    const s8 = Math.round(s * 255);
    const v8 = Math.round(v * 255);
    return [h8 > 255 ? 255 : h8, s8, v8];
  }

  // ---------------------------------------------------------------------
  // 2. GLCM texture features (port of skimage.feature.graycomatrix /
  //    graycoprops with distances=[1], angles=[0, 45, 90, 135deg],
  //    levels=32, symmetric=True, normed=True, then averaged over the
  //    4 angles — exactly what predict_sample.py's glcm_features() does)
  // ---------------------------------------------------------------------

  const GLCM_LEVELS = 32;
  const GLCM_OFFSETS = [
    [0, 1],   // angle 0:      (drow, dcol) = (0, +1)
    [-1, 1],  // angle 45deg:  (-1, +1)
    [-1, 0],  // angle 90deg:  (-1, 0)
    [-1, -1]  // angle 135deg: (-1, -1)
  ];

  function quantize(grayFlat, w, h) {
    const q = new Uint8Array(w * h);
    for (let i = 0; i < grayFlat.length; i++) {
      let v = Math.floor((grayFlat[i] / 255) * (GLCM_LEVELS - 1));
      if (v < 0) v = 0;
      if (v > GLCM_LEVELS - 1) v = GLCM_LEVELS - 1;
      q[i] = v;
    }
    return q;
  }

  function glcmForOffset(q, w, h, drow, dcol) {
    const L = GLCM_LEVELS;
    const P = new Float64Array(L * L);
    let total = 0;
    for (let row = 0; row < h; row++) {
      const row2 = row + drow;
      if (row2 < 0 || row2 >= h) continue;
      for (let col = 0; col < w; col++) {
        const col2 = col + dcol;
        if (col2 < 0 || col2 >= w) continue;
        const i = q[row * w + col];
        const j = q[row2 * w + col2];
        P[i * L + j] += 1;
        // symmetric: also count the reverse pair
        P[j * L + i] += 1;
        total += 2;
      }
    }
    if (total > 0) {
      for (let k = 0; k < P.length; k++) P[k] /= total;
    }
    return P;
  }

  function glcmProps(P) {
    const L = GLCM_LEVELS;
    let contrast = 0, dissimilarity = 0, homogeneity = 0, asm = 0;
    let meanI = 0, meanJ = 0;
    for (let i = 0; i < L; i++) {
      for (let j = 0; j < L; j++) {
        const p = P[i * L + j];
        const d = i - j;
        contrast += p * d * d;
        dissimilarity += p * Math.abs(d);
        homogeneity += p / (1 + d * d);
        asm += p * p;
        meanI += i * p;
        meanJ += j * p;
      }
    }
    let varI = 0, varJ = 0, cov = 0;
    for (let i = 0; i < L; i++) {
      for (let j = 0; j < L; j++) {
        const p = P[i * L + j];
        const di = i - meanI, dj = j - meanJ;
        varI += p * di * di;
        varJ += p * dj * dj;
        cov += p * di * dj;
      }
    }
    const stdI = Math.sqrt(varI), stdJ = Math.sqrt(varJ);
    let correlation;
    if (stdI < 1e-15 || stdJ < 1e-15) correlation = 1;
    else correlation = cov / (stdI * stdJ);
    const energy = Math.sqrt(asm);
    return { contrast, dissimilarity, homogeneity, energy, correlation, asm };
  }

  // Matches predict_sample.py's glcm_features(): mean over the 4 angles
  // of [contrast, dissimilarity, homogeneity, energy, correlation, ASM]
  function glcmFeatures(grayFlat, w, h) {
    const q = quantize(grayFlat, w, h);
    const acc = { contrast: 0, dissimilarity: 0, homogeneity: 0, energy: 0, correlation: 0, asm: 0 };
    for (const [drow, dcol] of GLCM_OFFSETS) {
      const P = glcmForOffset(q, w, h, drow, dcol);
      const props = glcmProps(P);
      acc.contrast += props.contrast;
      acc.dissimilarity += props.dissimilarity;
      acc.homogeneity += props.homogeneity;
      acc.energy += props.energy;
      acc.correlation += props.correlation;
      acc.asm += props.asm;
    }
    const n = GLCM_OFFSETS.length;
    return [
      acc.contrast / n, acc.dissimilarity / n, acc.homogeneity / n,
      acc.energy / n, acc.correlation / n, acc.asm / n
    ];
  }

  // ---------------------------------------------------------------------
  // 3. Basic stats helpers
  // ---------------------------------------------------------------------

  function mean(arr) {
    let s = 0;
    for (let i = 0; i < arr.length; i++) s += arr[i];
    return s / arr.length;
  }
  function std(arr, m) {
    let s = 0;
    for (let i = 0; i < arr.length; i++) { const d = arr[i] - m; s += d * d; }
    return Math.sqrt(s / arr.length);
  }
  function median(sortedArr) {
    const n = sortedArr.length;
    const mid = Math.floor(n / 2);
    return n % 2 === 0 ? (sortedArr[mid - 1] + sortedArr[mid]) / 2 : sortedArr[mid];
  }
  // scipy.stats.skew default (population, bias=True): m3 / m2^1.5
  function skew(arr, m) {
    let m2 = 0, m3 = 0;
    for (let i = 0; i < arr.length; i++) {
      const d = arr[i] - m;
      m2 += d * d;
      m3 += d * d * d;
    }
    m2 /= arr.length;
    m3 /= arr.length;
    if (m2 === 0) return 0;
    return m3 / Math.pow(m2, 1.5);
  }

  // ---------------------------------------------------------------------
  // 4. Full 32-feature extraction — mirrors extract_features() in
  //    predict_sample.py / the training notebook, feature-for-feature.
  //    rgbPixels: Uint8ClampedArray/Array length w*h*3 (R,G,B,R,G,B,...)
  //    nirPixels: Uint8ClampedArray/Array length w*h (grayscale)
  // ---------------------------------------------------------------------

  function extractFeatures(rgbPixels, nirPixels, w, h) {
    const n = w * h;
    const rArr = new Float64Array(n), gArr = new Float64Array(n), bArr = new Float64Array(n);
    const grayArr = new Float64Array(n);
    const hArr = new Float64Array(n), sArr = new Float64Array(n), vArr = new Float64Array(n);

    for (let i = 0; i < n; i++) {
      const r = rgbPixels[i * 3], g = rgbPixels[i * 3 + 1], b = rgbPixels[i * 3 + 2];
      rArr[i] = r / 255; gArr[i] = g / 255; bArr[i] = b / 255;
      grayArr[i] = rgbToGray(r, g, b);
      const [h8, s8, v8] = rgbToHsv8(r, g, b);
      hArr[i] = h8 / 255; sArr[i] = s8 / 255; vArr[i] = v8 / 255;
    }

    const feats = [];
    const rMean = mean(rArr); feats.push(rMean, std(rArr, rMean));
    const gMean = mean(gArr); feats.push(gMean, std(gArr, gMean));
    const bMean = mean(bArr); feats.push(bMean, std(bArr, bMean));
    const hMean = mean(hArr); feats.push(hMean, std(hArr, hMean));
    const sMean = mean(sArr); feats.push(sMean, std(sArr, sMean));
    const vMean = mean(vArr); feats.push(vMean, std(vArr, vMean));

    const nirF = new Float64Array(n);
    for (let i = 0; i < n; i++) nirF[i] = nirPixels[i] / 255;
    const nirMean = mean(nirF); feats.push(nirMean, std(nirF, nirMean));

    const ndvi = new Float64Array(n);
    for (let i = 0; i < n; i++) ndvi[i] = (nirF[i] - rArr[i]) / (nirF[i] + rArr[i] + 1e-6);
    const ndviMean = mean(ndvi);
    const ndviStd = std(ndvi, ndviMean);
    const ndviSorted = Array.from(ndvi).sort((a, b) => a - b);
    feats.push(
      ndviMean, ndviStd,
      ndviSorted[0], ndviSorted[ndviSorted.length - 1],
      median(ndviSorted), skew(ndvi, ndviMean)
    );

    feats.push(...glcmFeatures(grayArr, w, h));
    feats.push(...glcmFeatures(nirPixels, w, h));

    return feats; // length 32, same order as feature_names.json
  }

  // ---------------------------------------------------------------------
  // 4b. RGB-only 18-feature extraction — mirrors evaluate_feature_subset()
  //    with RGB_ONLY_IDX = range(0,12) + range(20,26) in the training
  //    notebook (R/G/B/H/S/V stats + GLCM texture on the RGB-gray image).
  //    No NIR/NDVI involved at all — used for live photo uploads, where
  //    there is no real NIR band to work with (see js/ml/README.md for
  //    why this is preferred over synthesizing one).
  // ---------------------------------------------------------------------

  function extractRGBOnlyFeatures(rgbPixels, w, h) {
    const n = w * h;
    const rArr = new Float64Array(n), gArr = new Float64Array(n), bArr = new Float64Array(n);
    const grayArr = new Float64Array(n);
    const hArr = new Float64Array(n), sArr = new Float64Array(n), vArr = new Float64Array(n);

    for (let i = 0; i < n; i++) {
      const r = rgbPixels[i * 3], g = rgbPixels[i * 3 + 1], b = rgbPixels[i * 3 + 2];
      rArr[i] = r / 255; gArr[i] = g / 255; bArr[i] = b / 255;
      grayArr[i] = rgbToGray(r, g, b);
      const [h8, s8, v8] = rgbToHsv8(r, g, b);
      hArr[i] = h8 / 255; sArr[i] = s8 / 255; vArr[i] = v8 / 255;
    }

    const feats = [];
    const rMean = mean(rArr); feats.push(rMean, std(rArr, rMean));
    const gMean = mean(gArr); feats.push(gMean, std(gArr, gMean));
    const bMean = mean(bArr); feats.push(bMean, std(bArr, bMean));
    const hMean = mean(hArr); feats.push(hMean, std(hArr, hMean));
    const sMean = mean(sArr); feats.push(sMean, std(sArr, sMean));
    const vMean = mean(vArr); feats.push(vMean, std(vArr, vMean));

    feats.push(...glcmFeatures(grayArr, w, h));

    return feats; // length 18, order: RGB_ONLY_IDX = [0..11] + [20..25]
  }

  // ---------------------------------------------------------------------
  // 5. Gradient Boosting inference — replays scikit-learn's
  //    GradientBoostingClassifier.decision_function()/predict_proba()
  //    using the exported tree ensemble (model-data.json)
  // ---------------------------------------------------------------------

  function evalTree(tree, x) {
    let node = 0;
    while (tree.l[node] !== -1) {
      const f = tree.f[node];
      node = x[f] <= tree.t[node] ? tree.l[node] : tree.r[node];
    }
    return tree.v[node];
  }

  function softmax(scores) {
    const max = Math.max(...scores);
    const exps = scores.map((s) => Math.exp(s - max));
    const sum = exps.reduce((a, b) => a + b, 0);
    return exps.map((e) => e / sum);
  }

  function scaleFeatures(scaler, rawFeatures) {
    return rawFeatures.map((v, i) => (v - scaler.mean[i]) / scaler.scale[i]);
  }

  // Roughly: "how far outside the range of the training photos does this
  // feature vector fall?" Mean squared z-score across features. Real
  // training images (frontend/js/ml/README.md has the calibration
  // numbers) score 0-13; unrelated photos (people, random objects, solid
  // colors, noise) scored 30-1500 in testing. See OUTLIER_THRESHOLD below.
  function outlierScore(scaledFeatures) {
    let sum = 0;
    for (let i = 0; i < scaledFeatures.length; i++) sum += scaledFeatures[i] * scaledFeatures[i];
    return sum / scaledFeatures.length;
  }

  // Training data max was 13.0 (RGB-only features); the lowest score among
  // varied non-leaf test images (random noise, gradients, solid colors,
  // photos of people) was ~30. 20 sits with margin on both sides.
  const OUTLIER_THRESHOLD = 20;

  // ---------------------------------------------------------------------
  // Second, independent OOD signal: what fraction of pixels are
  // vegetation-colored (green channel not clearly dominated by red or
  // blue)? This catches cases the statistical z-score guard misses on its
  // own — e.g. a portrait's skin tones and clothing can land inside the
  // z-score range training photos occupy (see js/ml/README.md /
  // out-of-distribution history) even though almost none of the pixels
  // look like a leaf. Calibrated against 900 real dataset images spanning
  // all 6 classes, including heavily necrotic/discolored diseased leaves:
  // the worst real leaf photo scored 0.337 green fraction; none were below
  // 0.30. A real portrait photo scored 0.095 — comfortable margin.
  function greenFraction(rgbPixels, w, h) {
    const n = w * h;
    let count = 0;
    for (let i = 0; i < n; i++) {
      const r = rgbPixels[i * 3], g = rgbPixels[i * 3 + 1], b = rgbPixels[i * 3 + 2];
      if (g >= r - 5 && g >= b - 5) count++;
    }
    return count / n;
  }

  const GREEN_FRACTION_THRESHOLD = 0.30;

  function predictProba(modelData, rawFeatures) {
    const { scaler, trees, meta } = modelData;
    const x = scaleFeatures(scaler, rawFeatures);

    const raw = meta.class_prior.map((p) => Math.log(p));
    for (let round = 0; round < trees.length; round++) {
      const roundTrees = trees[round];
      for (let k = 0; k < roundTrees.length; k++) {
        raw[k] += meta.learning_rate * evalTree(roundTrees[k], x);
      }
    }
    return softmax(raw);
  }

  // ---------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------

  // Keyed by URL so the fusion model and the RGB-only model can both be
  // cached at once (both are fetched from different JSON files).
  const modelCache = {};
  const loadingPromises = {};

  function loadModel(url) {
    const key = url || 'js/ml/model-data.json';
    if (modelCache[key]) return Promise.resolve(modelCache[key]);
    if (loadingPromises[key]) return loadingPromises[key];
    loadingPromises[key] = fetch(key)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load ' + key + ' (' + res.status + ')');
        return res.json();
      })
      .then((data) => { modelCache[key] = data; return data; })
      .catch((err) => {
        // Don't leave a failed fetch cached forever — clear it so the
        // next call (e.g. the user clicking "Analyse" again) retries
        // instead of instantly re-throwing the same old error.
        delete loadingPromises[key];
        throw err;
      });
    return loadingPromises[key];
  }

  function getImagePixels(canvas) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    const imgData = ctx.getImageData(0, 0, w, h);
    const px = imgData.data; // RGBA
    const n = w * h;
    const rgbPixels = new Uint8ClampedArray(n * 3);
    for (let i = 0; i < n; i++) {
      rgbPixels[i * 3] = px[i * 4];
      rgbPixels[i * 3 + 1] = px[i * 4 + 1];
      rgbPixels[i * 3 + 2] = px[i * 4 + 2];
    }
    return { rgbPixels, w, h };
  }

  function toResult(modelData, probs, scaledFeatures, rgbPixels, w, h) {
    const classes = modelData.meta.classes;
    const order = classes.map((name, idx) => ({ name, prob: probs[idx] }))
      .sort((a, b) => b.prob - a.prob);
    const score = outlierScore(scaledFeatures);
    const greenFrac = greenFraction(rgbPixels, w, h);
    // Reject if EITHER signal says this doesn't look like a leaf photo —
    // they catch different failure modes (see comments above each one).
    const looksLikeRiceLeaf = score < OUTLIER_THRESHOLD && greenFrac >= GREEN_FRACTION_THRESHOLD;
    return {
      className: order[0].name,
      confidence: order[0].prob * 100,
      probabilities: order,
      modelSummary: modelData.model_summary,
      outlierScore: score,
      greenFraction: greenFrac,
      looksLikeRiceLeaf
    };
  }

  // Default path for a live photo upload: there is no real NIR band, so
  // this uses the model trained WITHOUT NIR/NDVI features (83.13% test
  // accuracy, vs. 85.74% for the full fusion model on real sensor pairs).
  // This is deliberately preferred over synthesizing a fake NIR band and
  // feeding it to the fusion model — see js/ml/README.md for why.
  function predictFromCanvas(canvas, opts) {
    opts = opts || {};
    const modelUrl = opts.modelUrl || 'js/ml/model-data-rgb-only.json';
    return loadModel(modelUrl).then((modelData) => {
      const { rgbPixels, w, h } = getImagePixels(canvas);
      const features = extractRGBOnlyFeatures(rgbPixels, w, h);
      const probs = predictProba(modelData, features);
      const scaled = scaleFeatures(modelData.scaler, features);
      return { ...toResult(modelData, probs, scaled, rgbPixels, w, h), features };
    });
  }

  // Fusion path for cases where a REAL Pseudo-NIR band exists (e.g. the
  // bundled dataset images, which ship with true RGB/Pseudo-NIR pairs).
  // Uses the full 32-feature model (85.74% test accuracy).
  function predictFromCanvasFusion(canvas, nirPixels, opts) {
    opts = opts || {};
    const modelUrl = opts.modelUrl || 'js/ml/model-data.json';
    return loadModel(modelUrl).then((modelData) => {
      const { rgbPixels, w, h } = getImagePixels(canvas);
      const features = extractFeatures(rgbPixels, nirPixels, w, h);
      const probs = predictProba(modelData, features);
      const scaled = scaleFeatures(modelData.scaler, features);
      return { ...toResult(modelData, probs, scaled, rgbPixels, w, h), features };
    });
  }

  const RiceML = {
    loadModel,
    predictFromCanvas,
    predictFromCanvasFusion,
    extractFeatures,
    extractRGBOnlyFeatures,
    predictProba,
    rgbToGray,
    rgbToHsv8,
    glcmFeatures,
    greenFraction,
    outlierScore
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = RiceML;
  } else {
    root.RiceML = RiceML;
  }
})(typeof window !== 'undefined' ? window : globalThis);
