/** Reconcile legacy availability without inferring visual or teacher approval. */
export function reconcileLegacyImageMetadata(metadata:Record<string,unknown>, questionPath?:string|null, markPath?:string|null):Record<string,unknown> {
 const next={...metadata};
 if(questionPath&&markPath&&next.image_status==="not_uploaded")delete next.image_status;
 const old=(metadata.crop_review&&typeof metadata.crop_review==="object"?metadata.crop_review:{}) as Record<string,unknown>;
 return {...next,crop_review:{question:"unreviewed",mark:"unreviewed",...old}};
}
export function metadataWithChangedCrop(metadata:Record<string,unknown>,kind:"question"|"mark",crop:unknown):Record<string,unknown> {
 const crops=(metadata.image_crops&&typeof metadata.image_crops==="object"?metadata.image_crops:{}) as Record<string,unknown>;
 const reviews=(metadata.crop_review&&typeof metadata.crop_review==="object"?metadata.crop_review:{}) as Record<string,unknown>;
 const next:Record<string,unknown>={...metadata,image_crops:{...crops,[kind]:crop},crop_review:{...reviews,[kind]:"unreviewed"}};
 // Any previous whole-image reviewed marker no longer certifies the changed crop.
 if(next.image_status==="reviewed")delete next.image_status;
 return next;
}
