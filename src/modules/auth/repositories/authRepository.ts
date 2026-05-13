import mongoose from "mongoose";
import { SellerModel, type ISeller } from "../schemas/sellerSchema.js";

export class AuthRepository {
  async findById(id: string): Promise<ISeller | null> {
    return SellerModel.findById(new mongoose.Types.ObjectId(id));
  }

  async findByMlUserId(mlUserId: string): Promise<ISeller | null> {
    return SellerModel.findOne({ mlUserId });
  }

  async upsertSeller(data: {
    mlUserId: string;
    nickname: string;
    accessToken: string;
    refreshToken: string;
    tokenExpiresAt: Date;
  }): Promise<ISeller> {
    return SellerModel.findOneAndUpdate(
      { mlUserId: data.mlUserId },
      { $set: data },
      { upsert: true, new: true },
    );
  }

  async updateTokens(
    mlUserId: string,
    tokens: { accessToken: string; refreshToken: string; tokenExpiresAt: Date },
  ): Promise<void> {
    await SellerModel.updateOne({ mlUserId }, { $set: tokens });
  }
}
