import mongoose from 'mongoose';

const websitePageSchema = new mongoose.Schema(
  {
    ownerKey: { type: String, required: true, index: true },
    url: { type: String, required: true },
    title: { type: String, default: '' },
    sourceSitemapUrl: { type: String, required: true },
    selected: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ['discovered', 'saved', 'archived'],
      default: 'discovered',
    },
    /** UI: New vs Used for pin workflow */
    pinUsage: {
      type: String,
      enum: ['new', 'used'],
      default: 'new',
    },

    imagesGalleryId: { type: mongoose.Schema.Types.ObjectId, ref: 'ImagesGallery', default: null },
    workflowJson: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

websitePageSchema.index({ ownerKey: 1, url: 1 }, { unique: true });

export const WebsitePage =
  mongoose.models.WebsitePage ||
  mongoose.model('WebsitePage', websitePageSchema);
