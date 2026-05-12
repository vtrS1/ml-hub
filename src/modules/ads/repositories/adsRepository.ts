import mongoose from 'mongoose';
import { AdModel, type IAd, SyncStatus } from '../schemas/adSchema.js';
import type { ListAdsQueryDto } from '../dtos/adsDto.js';

export class AdsRepository {
  async findAll(
    sellerId: string,
    query: ListAdsQueryDto,
  ): Promise<{ ads: IAd[]; total: number }> {
    const filter: Record<string, unknown> = {
      sellerId: new mongoose.Types.ObjectId(sellerId),
    };

    if (query.status) filter['status'] = query.status;
    if (query.title) filter['title'] = { $regex: query.title, $options: 'i' };

    const skip = (query.page - 1) * query.limit;

    const [ads, total] = await Promise.all([
      AdModel.find(filter).skip(skip).limit(query.limit).sort({ createdAt: -1 }),
      AdModel.countDocuments(filter),
    ]);

    return { ads, total };
  }

  async findById(id: string, sellerId: string): Promise<IAd | null> {
    return AdModel.findOne({
      _id: new mongoose.Types.ObjectId(id),
      sellerId: new mongoose.Types.ObjectId(sellerId),
    });
  }

  async findByMlItemId(mlItemId: string, sellerId: string): Promise<IAd | null> {
    return AdModel.findOne({
      mlItemId,
      sellerId: new mongoose.Types.ObjectId(sellerId),
    });
  }

  async findAllBySeller(sellerId: string): Promise<IAd[]> {
    return AdModel.find({ sellerId: new mongoose.Types.ObjectId(sellerId) });
  }

  async create(data: Partial<IAd>): Promise<IAd> {
    const ad = new AdModel(data);
    return ad.save();
  }

  async update(id: string, sellerId: string, data: Partial<IAd>): Promise<IAd | null> {
    return AdModel.findOneAndUpdate(
      { _id: new mongoose.Types.ObjectId(id), sellerId: new mongoose.Types.ObjectId(sellerId) },
      { $set: data },
      { new: true },
    );
  }

  async updateSyncStatus(
    id: string,
    syncStatus: SyncStatus,
    extra?: Partial<IAd>,
  ): Promise<void> {
    await AdModel.updateOne(
      { _id: new mongoose.Types.ObjectId(id) },
      { $set: { syncStatus, lastSyncAt: new Date(), ...extra } },
    );
  }
}
