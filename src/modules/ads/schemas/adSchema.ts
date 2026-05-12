import mongoose, { type Document, type Model } from 'mongoose';

export enum SyncStatus {
  SYNCED = 'SYNCED',
  PENDING = 'PENDING',
  ERROR = 'ERROR',
  CONFLICT = 'CONFLICT',
}

export interface IAd extends Document {
  sellerId: mongoose.Types.ObjectId;
  mlItemId: string;
  title: string;
  description: string;
  price: number;
  availableQuantity: number;
  status: string;
  thumbnail: string;
  permalink: string;
  syncStatus: SyncStatus;
  lastSyncAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const adSchema = new mongoose.Schema<IAd>(
  {
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', required: true },
    mlItemId: { type: String, default: '' },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    price: { type: Number, required: true },
    availableQuantity: { type: Number, required: true, default: 0 },
    status: { type: String, default: 'active' },
    thumbnail: { type: String, default: '' },
    permalink: { type: String, default: '' },
    syncStatus: { type: String, enum: Object.values(SyncStatus), default: SyncStatus.PENDING },
    lastSyncAt: { type: Date },
  },
  { timestamps: true },
);

adSchema.index({ mlItemId: 1, sellerId: 1 }, { unique: true, sparse: true });

export const AdModel: Model<IAd> = mongoose.model<IAd>('Ad', adSchema);
