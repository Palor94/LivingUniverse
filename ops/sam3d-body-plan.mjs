// Frozen public artifact scope. Weights and installation state stay in AppData.
export default {
  "kind": "sam3d-body-local-trial-v1",
  "owner_approval": "2026-11-23: do all recommended work; public download cap raised to 5 GB",
  "maximum_download_bytes": 5000000000,
  "previous_successful_artifact_bytes": 18197181,
  "metadata_reserve_bytes": 1000000,
  "source_repository": "https://github.com/facebookresearch/sam-3d-body",
  "source_commit": "b5c765a0d89d789985e186d396315e7590887b94",
  "model_repository": "facebook/sam-3d-body-vith",
  "model_files": [
    {"path": "model.ckpt", "bytes": 1691205237},
    {"path": "assets/mhr_model.pt", "bytes": 696110248},
    {"path": "model_config.yaml", "bytes": 1486}
  ],
  "model_access_url": "https://huggingface.co/facebook/sam-3d-body-vith",
  "license": "SAM License; owner must obtain access under the provider's conditions",
  "install_subdirectory": "LivingUniverse/vision-sam3d-body-vith-trial-v1",
  "maximum_trial_images": 24,
  "paid_usd": 0,
  "private_uploads": false,
  "training": false,
  "canon_writes": false,
  "automatic_identity_pass": false,
  "gates": [
    "authenticated authorized checkpoint access and pinned model revision/hash",
    "CPU-compatible inference dependencies and code verified on this Windows host",
    "cumulative source, runtime, dependency and weight downloads fit 5 GB",
    "same approved reference selection and single-person ambiguity abstention as prior local body trial"
  ]
};
