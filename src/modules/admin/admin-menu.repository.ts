import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  PickupLocationItemAvailability,
  PickupLocationItemAvailabilityDocument,
} from './schemas/pickup-location-item-availability.schema';
import {
  PickupLocationItemPrice,
  PickupLocationItemPriceDocument,
} from './schemas/pickup-location-item-price.schema';

export interface StockItemInput {
  itemId: string;
  itemType: 'food' | 'extra';
  name?: string;
}

@Injectable()
export class AdminMenuRepository {
  constructor(
    @InjectModel(PickupLocationItemAvailability.name)
    private readonly availabilityModel: Model<PickupLocationItemAvailabilityDocument>,
    @InjectModel(PickupLocationItemPrice.name)
    private readonly priceModel: Model<PickupLocationItemPriceDocument>,
  ) {}

  private validateObjectId(id: string, fieldName: string): void {
    if (!id || !Types.ObjectId.isValid(id)) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'INVALID_ID_FORMAT',
          message: `Invalid ${fieldName} format.`,
        },
      });
    }
  }

  // ── Stock status ────────────────────────────────────────────────────────────

  async getStockStatus(
    pickupLocationId: string,
    itemId: string,
    itemType: 'food' | 'extra',
  ): Promise<boolean> {
    this.validateObjectId(pickupLocationId, 'pickupLocationId');
    this.validateObjectId(itemId, 'itemId');

    const doc = await this.availabilityModel
      .findOne({
        pickupLocationId: new Types.ObjectId(pickupLocationId),
        itemId: new Types.ObjectId(itemId),
        itemType,
      })
      .lean()
      .exec();

    return doc?.inStock ?? true;
  }

  async getStockStatusBatch(
    pickupLocationId: string,
    items: StockItemInput[],
  ): Promise<Map<string, boolean>> {
    this.validateObjectId(pickupLocationId, 'pickupLocationId');
    if (items.length === 0) return new Map();

    const itemIds = items.map((i) => new Types.ObjectId(i.itemId));
    const itemTypes = [...new Set(items.map((i) => i.itemType))];

    const docs = await this.availabilityModel
      .find({
        pickupLocationId: new Types.ObjectId(pickupLocationId),
        itemId: { $in: itemIds },
        itemType: { $in: itemTypes },
      })
      .lean()
      .exec();

    const map = new Map<string, boolean>();
    for (const item of items) {
      const doc = docs.find(
        (d) =>
          d.itemId.toString() === item.itemId && d.itemType === item.itemType,
      );
      map.set(item.itemId, doc?.inStock ?? true);
    }
    return map;
  }

  async setStockStatus(
    pickupLocationId: string,
    itemId: string,
    itemType: 'food' | 'extra',
    inStock: boolean,
  ): Promise<void> {
    this.validateObjectId(pickupLocationId, 'pickupLocationId');
    this.validateObjectId(itemId, 'itemId');

    await this.availabilityModel
      .findOneAndUpdate(
        {
          pickupLocationId: new Types.ObjectId(pickupLocationId),
          itemId: new Types.ObjectId(itemId),
          itemType,
        },
        { $set: { inStock } },
        { upsert: true, new: true },
      )
      .exec();
  }

  async deleteStockStatus(
    pickupLocationId: string,
    itemId: string,
    itemType: 'food' | 'extra',
  ): Promise<void> {
    this.validateObjectId(pickupLocationId, 'pickupLocationId');
    this.validateObjectId(itemId, 'itemId');

    await this.availabilityModel
      .deleteMany({
        pickupLocationId: new Types.ObjectId(pickupLocationId),
        itemId: new Types.ObjectId(itemId),
        itemType,
      })
      .exec();
  }

  async deleteAllStockStatusForItem(
    itemId: string,
    itemType: 'food' | 'extra',
  ): Promise<void> {
    this.validateObjectId(itemId, 'itemId');
    await this.availabilityModel
      .deleteMany({ itemId: new Types.ObjectId(itemId), itemType })
      .exec();
  }

  // ── Location-specific pricing ────────────────────────────────────────────────

  async getLocationPrice(
    pickupLocationId: string,
    itemId: string,
    itemType: 'food' | 'extra',
  ): Promise<number | null> {
    this.validateObjectId(pickupLocationId, 'pickupLocationId');
    this.validateObjectId(itemId, 'itemId');

    const doc = await this.priceModel
      .findOne({
        pickupLocationId: new Types.ObjectId(pickupLocationId),
        itemId: new Types.ObjectId(itemId),
        itemType,
      })
      .lean()
      .exec();

    return doc?.price ?? null;
  }

  async getLocationPriceBatch(
    pickupLocationId: string,
    items: StockItemInput[],
  ): Promise<Map<string, number | null>> {
    this.validateObjectId(pickupLocationId, 'pickupLocationId');
    if (items.length === 0) return new Map();

    const itemIds = items.map((i) => new Types.ObjectId(i.itemId));
    const itemTypes = [...new Set(items.map((i) => i.itemType))];

    const docs = await this.priceModel
      .find({
        pickupLocationId: new Types.ObjectId(pickupLocationId),
        itemId: { $in: itemIds },
        itemType: { $in: itemTypes },
      })
      .lean()
      .exec();

    const map = new Map<string, number | null>();
    for (const item of items) {
      const doc = docs.find(
        (d) =>
          d.itemId.toString() === item.itemId && d.itemType === item.itemType,
      );
      map.set(item.itemId, doc?.price ?? null);
    }
    return map;
  }

  async setLocationPrice(
    pickupLocationId: string,
    itemId: string,
    itemType: 'food' | 'extra',
    price: number,
  ): Promise<void> {
    this.validateObjectId(pickupLocationId, 'pickupLocationId');
    this.validateObjectId(itemId, 'itemId');

    await this.priceModel
      .findOneAndUpdate(
        {
          pickupLocationId: new Types.ObjectId(pickupLocationId),
          itemId: new Types.ObjectId(itemId),
          itemType,
        },
        { $set: { price } },
        { upsert: true, new: true },
      )
      .exec();
  }

  async deleteLocationPrice(
    pickupLocationId: string,
    itemId: string,
    itemType: 'food' | 'extra',
  ): Promise<void> {
    this.validateObjectId(pickupLocationId, 'pickupLocationId');
    this.validateObjectId(itemId, 'itemId');

    await this.priceModel
      .deleteMany({
        pickupLocationId: new Types.ObjectId(pickupLocationId),
        itemId: new Types.ObjectId(itemId),
        itemType,
      })
      .exec();
  }

  async deleteAllLocationPricesForItem(
    itemId: string,
    itemType: 'food' | 'extra',
  ): Promise<void> {
    this.validateObjectId(itemId, 'itemId');
    await this.priceModel
      .deleteMany({ itemId: new Types.ObjectId(itemId), itemType })
      .exec();
  }
}
