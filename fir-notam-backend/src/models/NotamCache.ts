import mongoose, { Document, Schema } from 'mongoose';

export interface INotamItem {
    id: string;
    text: string;
    status: 'red' | 'orange' | 'green' | 'unknown';
    hasEscat: boolean;
    hasInterference: boolean;
    analysis?: {
        aField?: string;
        bField?: string;
        cField?: string;
        qCode?: string;
        eField?: string;
        isActive: boolean;
        isPermanent: boolean;
        startsAtUtc?: string;
        endsAtUtc?: string;
        matchedKeywords: string[];
        confidence: 'high' | 'medium' | 'low';
    };
}

export interface ILocationNotams extends Document {
    icao: string;
    notams: INotamItem[];
    status: 'red' | 'orange' | 'green' | 'unknown';
    hasEscat: boolean;
    hasInterference: boolean;
    cachedAt: number;
    lastCheckedAt?: number;
    lastSuccessfulUpdate?: number;
}

const NotamItemSchema = new Schema<INotamItem>({
    id: { type: String, required: true },
    text: { type: String, required: true },
    status: { type: String, enum: ['red', 'orange', 'green', 'unknown'], required: true },
    hasEscat: { type: Boolean, required: true },
    hasInterference: { type: Boolean, default: false },
    analysis: {
        aField: { type: String, required: false },
        bField: { type: String, required: false },
        cField: { type: String, required: false },
        dField: { type: String, required: false },
        qCode: { type: String, required: false },
        eField: { type: String, required: false },
        fField: { type: String, required: false },
        gField: { type: String, required: false },
        notamId: { type: String, required: false },
        notamType: { type: String, required: false },
        replacedId: { type: String, required: false },
        isActive: { type: Boolean, required: true },
        isPermanent: { type: Boolean, required: true },
        isEstimated: { type: Boolean, required: true },
        startsAtUtc: { type: String, required: false },
        endsAtUtc: { type: String, required: false },
        matchedKeywords: { type: [String], default: [] },
        confidence: { type: String, enum: ['high', 'medium', 'low'], required: true }
    }
}, { _id: false });

const LocationNotamsSchema = new Schema<ILocationNotams>({
    icao: { type: String, required: true, unique: true },
    notams: { type: [NotamItemSchema], default: [] },
    status: { type: String, enum: ['red', 'orange', 'green', 'unknown'], required: true },
    hasEscat: { type: Boolean, required: true },
    hasInterference: { type: Boolean, default: false },
    cachedAt: { type: Number, required: true },
    lastCheckedAt: { type: Number, required: false },
    lastSuccessfulUpdate: { type: Number, required: false }
});

export const NotamCacheModel = mongoose.model<ILocationNotams>('NotamCache', LocationNotamsSchema);
