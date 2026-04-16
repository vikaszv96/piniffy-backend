import mongoose from 'mongoose';

const imagesGallerySchema = new mongoose.Schema(
  {
    ownerKey: { type: String, required: true, index: true },
    pageId: { type: mongoose.Schema.Types.ObjectId, ref: 'WebsitePage', required: true, index: true },
    url: { type: String, required: true },
    images: { type: [String], default: [] },
    fetchedAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true }
);

imagesGallerySchema.index({ ownerKey: 1, pageId: 1 }, { unique: true });

export const ImagesGallery =
  mongoose.models.ImagesGallery || mongoose.model('ImagesGallery', imagesGallerySchema, 'imagesGallery');

