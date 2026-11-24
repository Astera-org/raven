import * as AvatarPrimitive from "@radix-ui/react-avatar";
import * as Dialog from "@radix-ui/react-dialog";
import { Crop as CropIcon, RotateCcw, X } from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import ReactCrop, {
  type Crop,
  type PixelCrop,
  centerCrop,
  convertToPixelCrop,
  makeAspectCrop,
} from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { assetUrl } from "~/api/utils";
import { cn } from "~/lib/utils";

interface AvatarSelectorProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  currentAvatarSrc?: string;
  currentAvatarFallback?: string;
  onAvatarChange: (file: File) => void | Promise<void>;
  disabled?: boolean;
}

function centeredSquareCrop(width: number, height: number): Crop {
  const cropWidthInPercent = (150 / width) * 100;
  const crop = makeAspectCrop(
    { unit: "%", width: cropWidthInPercent },
    1,
    width,
    height
  );
  return centerCrop(crop, width, height);
}

export default function AvatarSelector(props: AvatarSelectorProps) {
  const {
    isOpen,
    onOpenChange,
    currentAvatarSrc,
    currentAvatarFallback,
    onAvatarChange,
    disabled,
  } = props;

  const [imageSrc, setImageSrc] = useState<string>("");
  const [crop, setCrop] = useState<Crop>();
  const [scale, setScale] = useState(1);
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();

  const inputRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const cropRef = useRef<Crop | undefined>(undefined);

  // Opening the selector has no visible UI of its own until a file is
  // picked, so trigger the (hidden) file picker as soon as we're asked
  // to open.
  useEffect(() => {
    if (isOpen && !imageSrc && !disabled) {
      inputRef.current?.click();
    }
  }, [isOpen, imageSrc, disabled]);

  // The file input has no onCancel typing in React's DOM types, so listen
  // natively to close the selector if the OS picker is dismissed with no
  // file chosen.
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const handleNativeCancel = () => onOpenChange(false);
    input.addEventListener("cancel", handleNativeCancel);
    return () => input.removeEventListener("cancel", handleNativeCancel);
  }, [onOpenChange]);

  const resetState = () => {
    setImageSrc("");
    setScale(1);
    setCrop(undefined);
    setCompletedCrop(undefined);
    cropRef.current = undefined;
  };

  const onSelectFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) {
      onOpenChange(false);
      return;
    }

    setCrop(undefined);
    cropRef.current = undefined;
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      setImageSrc(reader.result?.toString() || "");
    });
    reader.readAsDataURL(file);
  };

  const onImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    const newCrop = centeredSquareCrop(width, height);
    setCrop(newCrop);
    cropRef.current = newCrop;
  };

  const resetCrop = () => {
    setScale(1);
    if (imgRef.current) {
      const { width, height } = imgRef.current;
      const newCrop = centeredSquareCrop(width, height);
      setCrop(newCrop);
      cropRef.current = newCrop;
    }
  };

  const getCroppedImg = useCallback(
    (image: HTMLImageElement, crop: PixelCrop): Promise<Blob> => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        throw new Error("No 2d context");
      }

      const pixelRatio = window.devicePixelRatio;
      canvas.width = Math.floor(crop.width * pixelRatio);
      canvas.height = Math.floor(crop.height * pixelRatio);

      ctx.scale(pixelRatio, pixelRatio);
      ctx.imageSmoothingQuality = "high";

      ctx.drawImage(
        image,
        crop.x,
        crop.y,
        crop.width,
        crop.height,
        0,
        0,
        crop.width,
        crop.height
      );

      return new Promise((resolve, reject) => {
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error("Failed to create image blob"));
            }
          },
          "image/jpeg",
          0.9
        );
      });
    },
    []
  );

  const handleSave = useCallback(async () => {
    const image = imgRef.current;
    if (!image || !cropRef.current) {
      return;
    }

    // The crop box is defined in the img's unscaled layout space, but
    // `transform: scale(...)` zooms the rendered image around its center
    // (transform-origin: 50% 50%). Undo that centered zoom in percent
    // space before mapping onto natural pixels, so the crop matches what's
    // actually visible under the zoom.
    const center = 50;
    const zoomAdjustedCrop: Crop = {
      ...cropRef.current,
      x: center + (cropRef.current.x - center) / scale,
      y: center + (cropRef.current.y - center) / scale,
      width: cropRef.current.width / scale,
      height: cropRef.current.height / scale,
    };

    const pixelCrop = convertToPixelCrop(
      zoomAdjustedCrop,
      image.naturalWidth,
      image.naturalHeight
    );

    if (!pixelCrop.width || !pixelCrop.height) {
      return;
    }

    const croppedImageBlob = await getCroppedImg(image, pixelCrop);
    const file = new File([croppedImageBlob], "avatar.jpg", {
      type: "image/jpeg",
    });
    await onAvatarChange(file);
    resetState();
    onOpenChange(false);
  }, [getCroppedImg, onAvatarChange, onOpenChange, scale]);

  const handleCancel = () => {
    resetState();
    onOpenChange(false);
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onSelectFile}
        disabled={disabled}
      />

      <Dialog.Root
        open={isOpen && !!imageSrc}
        onOpenChange={(open) => !open && handleCancel()}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-carbon-900/30 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <Dialog.Content
            className="fixed top-1/2 left-1/2 z-50 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white shadow-xl"
            aria-describedby={undefined}
          >
            <div className="flex items-center justify-between border-b border-carbon-100 px-6 py-5">
              <Dialog.Title className="text-carbon-800 flex items-center gap-2 font-serif text-headline-10">
                <CropIcon className="size-5" />
                Crop & scale avatar
              </Dialog.Title>
              <div className="flex items-center gap-3">
                <AvatarPrimitive.Root className="relative flex size-8 shrink-0 overflow-hidden rounded-full">
                  <AvatarPrimitive.Image
                    src={assetUrl(currentAvatarSrc) ?? undefined}
                    alt="Current avatar"
                    className="aspect-square size-full object-cover"
                  />
                  <AvatarPrimitive.Fallback className="flex size-full items-center justify-center bg-sky-blue-500 text-caption-20 font-mono uppercase">
                    {currentAvatarFallback}
                  </AvatarPrimitive.Fallback>
                </AvatarPrimitive.Root>
                <Dialog.Close
                  aria-label="Close dialog"
                  className="flex size-8 items-center justify-center rounded text-carbon-300 transition-colors hover:bg-gray-200 hover:text-foreground"
                >
                  <X className="size-4" />
                </Dialog.Close>
              </div>
            </div>

            <div className="px-6 py-6">
              {imageSrc && (
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <label
                      htmlFor="avatar-scale"
                      className="min-w-fit text-caption-40 font-mono text-carbon-500"
                    >
                      Scale:
                    </label>
                    <input
                      id="avatar-scale"
                      type="range"
                      min={0.5}
                      max={3}
                      step={0.1}
                      value={scale}
                      onChange={(e) => setScale(Number(e.target.value))}
                      className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-carbon-100 accent-carbon-500"
                    />
                    <span className="text-carbon-400 min-w-fit text-caption-40">
                      {scale.toFixed(1)}x
                    </span>
                    <button
                      type="button"
                      onClick={resetCrop}
                      className="text-body-20 flex items-center gap-1 rounded-full border border-carbon-200 px-3 py-1 text-carbon-400 transition-colors hover:border-carbon-300 hover:text-foreground"
                    >
                      <RotateCcw className="size-3" />
                      Reset
                    </button>
                  </div>

                  <div className="overflow-hidden rounded-lg border border-carbon-100">
                    <ReactCrop
                      crop={crop}
                      onChange={(_, percentCrop) => {
                        setCrop(percentCrop);
                        cropRef.current = percentCrop;
                      }}
                      onComplete={(c) => setCompletedCrop(c)}
                      aspect={1}
                      minWidth={50}
                      minHeight={50}
                      keepSelection
                      circularCrop
                    >
                      <img
                        ref={imgRef}
                        alt="Crop preview"
                        src={imageSrc}
                        style={{
                          transform: `scale(${scale})`,
                          maxHeight: "400px",
                          maxWidth: "100%",
                        }}
                        onLoad={onImageLoad}
                      />
                    </ReactCrop>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 border-t border-carbon-100 px-6 py-4">
              <button
                type="button"
                onClick={handleCancel}
                className="text-body-20 rounded-full border border-carbon-200 px-4 py-1.5 text-carbon-400 transition-colors hover:border-carbon-300 hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!completedCrop?.width || !completedCrop?.height}
                onClick={handleSave}
                className={cn(
                  "text-body-20 rounded-full border border-carbon-200 px-4 py-1.5 text-carbon-400 transition-colors hover:border-carbon-300 hover:text-foreground",
                  completedCrop?.width && completedCrop?.height
                    ? "bg-gray-blue-900 text-white"
                    : "cursor-not-allowed bg-carbon-100 text-carbon-300"
                )}
              >
                Save avatar
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
