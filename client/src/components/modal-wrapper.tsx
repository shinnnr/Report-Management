import * as React from "react";
import { Dialog, DialogContent, DialogOverlay, DialogPortal } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface ModalWrapperProps {
  children: React.ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  triggerRef?: React.RefObject<HTMLElement>;
  className?: string;
}

export function ModalWrapper({
  children,
  open,
  onOpenChange,
  triggerRef,
  className
}: ModalWrapperProps) {
  const [buttonRect, setButtonRect] = React.useState<DOMRect | null>(null);
  const [isAnimating, setIsAnimating] = React.useState(false);

  // Capture button position when opening
  React.useEffect(() => {
    if (open && triggerRef?.current && !buttonRect) {
      const rect = triggerRef.current.getBoundingClientRect();
      setButtonRect(rect);
      setIsAnimating(true);

      // Reset animation state after animation completes
      const timer = setTimeout(() => {
        setIsAnimating(false);
      }, 350);

      return () => clearTimeout(timer);
    } else if (!open && buttonRect) {
      // Closing animation
      setIsAnimating(true);
      const timer = setTimeout(() => {
        setButtonRect(null);
        setIsAnimating(false);
      }, 300);

      return () => clearTimeout(timer);
    } else if (!open) {
      setButtonRect(null);
      setIsAnimating(false);
    }
  }, [open, triggerRef, buttonRect]);

  // Calculate transform origin and initial position
  const getTransformStyles = () => {
    if (!buttonRect || !isAnimating) return {};

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Calculate center of screen
    const centerX = viewportWidth / 2;
    const centerY = viewportHeight / 2;

    // Calculate button center
    const buttonCenterX = buttonRect.left + buttonRect.width / 2;
    const buttonCenterY = buttonRect.top + buttonRect.height / 2;

    // Calculate offset from button to center
    const offsetX = centerX - buttonCenterX;
    const offsetY = centerY - buttonCenterY;

    return {
      '--tw-translate-x': `-${offsetX}px`,
      '--tw-translate-y': `-${offsetY}px`,
      transformOrigin: `${buttonCenterX}px ${buttonCenterY}px`,
    } as React.CSSProperties;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay
          className={cn(
            "fixed inset-0 z-50 bg-black/80",
            open && "animate-in fade-in duration-300",
            !open && "animate-out fade-out duration-300"
          )}
        />
        <DialogContent
          className={cn(
            "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg sm:rounded-lg",
            // Custom swoosh animation
            open && isAnimating && [
              "animate-in duration-350 ease-out",
              "zoom-in-75 fade-in-0",
              "slide-in-from-left-[var(--tw-translate-x)] slide-in-from-top-[var(--tw-translate-y)]"
            ],
            !open && isAnimating && [
              "animate-out duration-300 ease-in",
              "zoom-out-75 fade-out-0",
              "slide-out-to-left-[var(--tw-translate-x)] slide-out-to-top-[var(--tw-translate-y)]"
            ],
            // Default animations when not swooshing
            open && !isAnimating && "animate-in fade-in-0 zoom-in-95 duration-200 slide-in-from-left-1/2 slide-in-from-top-[48%]",
            !open && !isAnimating && "animate-out fade-out-0 zoom-out-95 duration-200 slide-out-to-left-1/2 slide-out-to-top-[48%]",
            className
          )}
          style={isAnimating ? getTransformStyles() : undefined}
        >
          {children}
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}