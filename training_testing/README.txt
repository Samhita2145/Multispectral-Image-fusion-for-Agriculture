RICE LEAF DISEASE — FUSION / NDVI / FEATURE EXTRACTION / TRAINING
====================================================================

WHAT'S IN THIS FOLDER
----------------------
Rice_Fusion_NDVI_Feature_Training.ipynb
    The main notebook. Already fully executed - open it and you can see every
    result (fusion visualizations, NDVI heatmaps, feature table, model
    comparison, accuracy, confusion matrix) without re-running anything.
    It will also re-run cleanly top-to-bottom if you want to.

feature_fusion_gb_model.joblib
    The trained Gradient Boosting classifier (the final model).

feature_scaler.joblib
    The StandardScaler used to normalize features before prediction.
    You must use this same scaler on any new image before feeding it
    to the model, or predictions will be wrong.

feature_names.json
    Ordered list of the 32 feature names the model expects.

classes.json
    The 6 disease class names, in the order the model predicts them.

model_summary.json
    Headline numbers: test accuracy (85.74%), 5-fold cross-validation
    accuracy (82.45%), etc.

Preprocessed/
    The RGB and Pseudo-NIR image folders the notebook was trained on
    (included so the notebook can be re-run standalone).

predict_sample.py
    A small script showing how to load the model + scaler and classify
    one new rice leaf image pair.


WHERE TO EXTRACT / RUN THIS
-----------------------------
1. Extract this zip anywhere on your computer, e.g.:
       Desktop/Rice_Fusion_NDVI_Deliverables/
2. Keep all the files together in that one folder - the notebook and the
   script both expect "Preprocessed/RGB" and "Preprocessed/Pseudo_NIR" to
   sit right next to them (relative paths), not in a different location.


HOW TO RUN THE NOTEBOOK
-------------------------
1. Install Python 3.9+ if you don't have it, then open a terminal
   (or Anaconda Prompt) INSIDE this extracted folder.
2. Install the required packages:
       pip install numpy pandas opencv-python matplotlib scipy scikit-learn scikit-image joblib jupyter
3. Launch Jupyter:
       jupyter notebook
   (or open the folder in Anaconda Navigator / VS Code / JupyterLab)
4. Open Rice_Fusion_NDVI_Feature_Training.ipynb.
   - To just view the saved results: do nothing else, all outputs are
     already there.
   - To re-run everything from scratch: Kernel -> Restart & Run All.


HOW TO USE THE TRAINED MODEL ON A NEW IMAGE
----------------------------------------------
Run the included example script from inside this folder:
       python predict_sample.py
It classifies one sample image pair from the Preprocessed folder as a demo.
Open predict_sample.py to see how to point it at your own RGB + Pseudo-NIR
image pair instead.


NOTES
------
- The model was trained on RGB + Pseudo-NIR image pairs that are already
  128x128 and preprocessed the same way as the images in Preprocessed/.
  Any new image you classify should go through the same preprocessing
  (resize to 128x128, matching RGB and Pseudo-NIR versions) before using
  predict_sample.py as a template.
- Test accuracy: 85.74%. The more conservative/trustworthy estimate is the
  5-fold cross-validation accuracy: 82.45% (+/- 1.34%), which is the one
  to quote for how well this generalizes.
