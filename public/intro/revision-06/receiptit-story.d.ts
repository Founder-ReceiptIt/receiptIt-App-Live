export const fontsReady: Promise<FontFace[]>;
export const steps: Array<{label:string; heading:string; copy:string}>;
export interface ReceiptItStoryElement extends HTMLElement {
 readonly duration: number;
 readonly currentTime: number;
 readonly paused: boolean;
 readonly completed: boolean;
 readonly finale: boolean;
 readonly beginReady: boolean;
 play(): void;
 pause(): void;
 replay(): void;
 seek(seconds: number): void;
}
export const timeline: {
 duration: number;
 steps: number[];
 explanationReady: number;
 addressStart: number;
 addressReady: number;
 migrateStart: number;
 migrateEnd: number;
 finale: number;
 beginReady: number;
};
