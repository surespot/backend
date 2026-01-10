import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { HydratedDocument } from 'mongoose';

export type RiderDocumentationDocument = HydratedDocument<RiderDocumentation>;

@Schema({ _id: false })
export class DocumentInfo {
  @Prop({ required: true })
  name: string;

  @Prop()
  url?: string;

  @Prop()
  uploadedAt?: Date;
}

@Schema({ _id: false })
export class EmergencyContact {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  phone: string;

  @Prop()
  relationship?: string;
}

@Schema({ timestamps: true })
export class RiderDocumentation {
  _id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'RiderProfile' })
  riderProfileId: Types.ObjectId;

  @Prop({ type: DocumentInfo })
  governmentId?: DocumentInfo;

  @Prop({ type: DocumentInfo })
  proofOfAddress?: DocumentInfo;

  @Prop({ type: DocumentInfo })
  passportPhotograph?: DocumentInfo;

  @Prop({ type: DocumentInfo })
  bankAccountDetails?: DocumentInfo;

  @Prop({ type: DocumentInfo })
  vehicleDocumentation?: DocumentInfo;

  @Prop({ type: EmergencyContact })
  emergencyContact?: EmergencyContact;
}

export const RiderDocumentationSchema =
  SchemaFactory.createForClass(RiderDocumentation);
