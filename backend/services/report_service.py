import json
import os
from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    Image,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

MODEL_TEST_ACCURACY = 0.8574  # 85.74%, from model_summary.json
MODEL_CV_MEAN = 0.8245  # 82.45%
MODEL_CV_STD = 0.0134  # +/- 1.34%

DISCLAIMER = (
    "This report was produced by an AI-based image classification model as part of the "
    "Multispectral Image Fusion for Agriculture project. It is intended to support, not "
    "replace, professional agricultural judgement. Results should not be treated as a "
    "definitive expert diagnosis -- please confirm with a qualified agronomist or plant "
    "pathologist before making treatment decisions."
)


def generate_report_pdf(
    output_path: str,
    *,
    user_name: str,
    user_email: str,
    prediction,
) -> str:
    """Builds a PDF report for a single Prediction row and writes it to
    output_path. Returns output_path."""
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("ReportTitle", parent=styles["Title"], fontSize=20, spaceAfter=4)
    subtitle_style = ParagraphStyle("Subtitle", parent=styles["Normal"], textColor=colors.HexColor("#4b5563"))
    section_style = ParagraphStyle(
        "Section", parent=styles["Heading2"], spaceBefore=14, spaceAfter=6, textColor=colors.HexColor("#1f6f2f")
    )
    normal = styles["Normal"]
    small_muted = ParagraphStyle("SmallMuted", parent=styles["Normal"], fontSize=8.5, textColor=colors.HexColor("#6b7280"))

    doc = SimpleDocTemplate(
        output_path,
        pagesize=A4,
        topMargin=18 * mm,
        bottomMargin=18 * mm,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        title="Rice Leaf Disease Analysis Report",
    )

    story = []
    story.append(Paragraph("Multispectral Image Fusion for Agriculture", title_style))
    story.append(Paragraph("Rice Leaf Disease Analysis Report", subtitle_style))
    story.append(Spacer(1, 10))

    meta_rows = [
        ["Report generated", datetime.now().strftime("%Y-%m-%d %H:%M")],
        ["Analysis date", prediction.created_at.strftime("%Y-%m-%d %H:%M")],
        ["User", f"{user_name} ({user_email})"],
        ["Prediction ID", str(prediction.id)],
        ["Model variant used", "RGB + Pseudo-NIR Fusion" if prediction.model_used == "fusion" else "RGB-only"],
    ]
    meta_table = Table(meta_rows, colWidths=[45 * mm, 120 * mm])
    meta_table.setStyle(
        TableStyle(
            [
                ("FONTSIZE", (0, 0), (-1, -1), 9.5),
                ("TEXTCOLOR", (0, 0), (0, -1), colors.HexColor("#4b5563")),
                ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    story.append(meta_table)

    # Images
    story.append(Paragraph("Analyzed Images", section_style))
    image_cells = []
    if prediction.rgb_image_path and os.path.isfile(prediction.rgb_image_path):
        image_cells.append(
            [Image(prediction.rgb_image_path, width=55 * mm, height=55 * mm), Paragraph("RGB Image", small_muted)]
        )
    if prediction.nir_image_path and os.path.isfile(prediction.nir_image_path):
        image_cells.append(
            [Image(prediction.nir_image_path, width=55 * mm, height=55 * mm), Paragraph("Pseudo-NIR Image", small_muted)]
        )
    if prediction.ndvi_heatmap_path and os.path.isfile(prediction.ndvi_heatmap_path):
        image_cells.append(
            [Image(prediction.ndvi_heatmap_path, width=55 * mm, height=55 * mm), Paragraph("NDVI Heatmap", small_muted)]
        )

    if image_cells:
        row_imgs = [c[0] for c in image_cells]
        row_caps = [c[1] for c in image_cells]
        img_table = Table([row_imgs, row_caps], colWidths=[57 * mm] * len(image_cells))
        img_table.setStyle(TableStyle([("ALIGN", (0, 0), (-1, -1), "CENTER")]))
        story.append(img_table)
    else:
        story.append(Paragraph("No stored images available for this prediction.", normal))

    # Prediction results
    story.append(Paragraph("Prediction Result", section_style))
    result_rows = [
        ["Predicted class", prediction.predicted_class],
        ["Confidence", f"{prediction.confidence:.2f}%"],
    ]
    result_table = Table(result_rows, colWidths=[45 * mm, 120 * mm])
    result_table.setStyle(
        TableStyle(
            [
                ("FONTSIZE", (0, 0), (-1, -1), 10),
                ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f3f8f3")),
                ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#c9e0c9")),
            ]
        )
    )
    story.append(result_table)
    story.append(Spacer(1, 8))

    probs = json.loads(prediction.class_probabilities)
    prob_rows = [["Disease class", "Probability"]] + [
        [cls, f"{p:.2f}%"] for cls, p in sorted(probs.items(), key=lambda x: -x[1])
    ]
    prob_table = Table(prob_rows, colWidths=[110 * mm, 55 * mm])
    prob_table.setStyle(
        TableStyle(
            [
                ("FONTSIZE", (0, 0), (-1, -1), 9.5),
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#2e7d32")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#d1d5db")),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f9fafb")]),
            ]
        )
    )
    story.append(Paragraph("All Class Probabilities", styles["Heading3"]))
    story.append(prob_table)

    # NDVI
    if prediction.ndvi_mean is not None:
        story.append(Paragraph("NDVI Statistics", section_style))
        ndvi_rows = [
            ["Minimum NDVI", f"{prediction.ndvi_min:.4f}"],
            ["Maximum NDVI", f"{prediction.ndvi_max:.4f}"],
            ["Mean NDVI", f"{prediction.ndvi_mean:.4f}"],
        ]
        ndvi_table = Table(ndvi_rows, colWidths=[45 * mm, 120 * mm])
        ndvi_table.setStyle(
            TableStyle(
                [
                    ("FONTSIZE", (0, 0), (-1, -1), 9.5),
                    ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ]
            )
        )
        story.append(ndvi_table)
    else:
        story.append(Paragraph("NDVI Statistics", section_style))
        story.append(
            Paragraph(
                "Not available for this analysis (no Pseudo-NIR image was supplied, so NDVI could not be "
                "honestly computed).",
                normal,
            )
        )

    # Model info
    story.append(Paragraph("Model Information", section_style))
    model_rows = [
        ["Model type", "Gradient Boosting Classifier (scikit-learn)"],
        ["Feature set", "RGB + HSV colour stats, NIR stats, NDVI stats, GLCM texture (RGB & NIR)"],
        ["Test accuracy", f"{MODEL_TEST_ACCURACY*100:.2f}%"],
        ["5-fold cross-validation accuracy", f"{MODEL_CV_MEAN*100:.2f}% (+/- {MODEL_CV_STD*100:.2f}%)"],
    ]
    model_table = Table(model_rows, colWidths=[65 * mm, 100 * mm])
    model_table.setStyle(
        TableStyle(
            [
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    story.append(model_table)

    story.append(Spacer(1, 16))
    story.append(Paragraph(DISCLAIMER, small_muted))

    doc.build(story)
    return output_path
