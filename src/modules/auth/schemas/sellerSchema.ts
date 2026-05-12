import mongoose, { type Document, type Model } from 'mongoose';

export interface ISeller extends Document {
  mlUserId: string;
  nickname: string;
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const sellerSchema = new mongoose.Schema<ISeller>(
  {
    mlUserId: { type: String, required: true, unique: true },
    nickname: { type: String, required: true },
    accessToken: { type: String, required: true },
    refreshToken: { type: String, required: true },
    tokenExpiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

export const SellerModel: Model<ISeller> = mongoose.model<ISeller>('Seller', sellerSchema);
