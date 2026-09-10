export const fontsReady: Promise<FontFace[]>;
export interface ReceiptItStoryElement extends HTMLElement {
 readonly duration: number;
 readonly currentTime: number;
 readonly paused: boolean;
 play(): void;
 pause(): void;
 seek(seconds: number): void;
}
