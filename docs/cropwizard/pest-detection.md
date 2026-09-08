# Pest Detection Tool

The **LeAF Pest Detection Model** is integrated into CropWizard to enhance pest-management capabilities. It uses custom-trained computer-vision models to identify a vast range of agricultural pests directly from images.

## The model

- **Architecture:** a refined YOLOv8x convolutional neural network.
- **Training data:** over 1 million pest images spanning **3,580 agricultural pest classes**, enabling it to recognize even subtle differences between pest species.
- **Detection, not just classification:** the model identifies the pest *and* provides bounding-box detection, pinpointing the pest's location in the image.
- **Edge-ready:** the model is lightweight enough to run on edge devices such as phones or agricultural robots, enabling on-the-spot analysis and field-level pest monitoring.

## Using it in CropWizard

Simply upload an image containing a suspected pest and ask a question. The tool is invoked automatically:

1. Your image is passed to the LeAF model.
2. The model returns the identification and an annotated detection image.
3. The final LLM sees the labeled output and folds it into a cited answer, combined with CropWizard's broader knowledge base — so you get identification *plus* treatment recommendations in one step.

Use it to quickly diagnose pest problems, track infestations, and get informed treatment recommendations — leading to healthier crops, reduced pesticide use, and more efficient operations. The model is continuously improved and retrained based on testing and feedback.

## How it fits the tools framework

Pest detection is a standard Illinois Chat [tool](../guides/tools-workflows.md): image in, annotated image + labels out, automatically selected by the LLM when your question and images make it relevant. See [Tool questions](index.md#tool-questions) for the steps CropWizard displays during a tool invocation.

LeAF was developed within the **AIFARMS** institute.
