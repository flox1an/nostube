import { X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";

export function DisclaimerBanner() {
  const [isVisible, setIsVisible] = useState(true);

  /*
  useEffect(() => {
   const dismissed = localStorage.getItem("disclaimer-dismissed");
    if (dismissed) {
      setIsVisible(false);
    }
  }, []);*/

  const handleDismiss = () => {
    localStorage.setItem("disclaimer-dismissed", "true");
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <Alert variant="destructive" className="relative">
      <AlertDescription className="pr-8">
        This is EXPERIMENTAL. Upload does NOT work yet, it will wipe your
        follows, etc.. beware!
      </AlertDescription>
      <Button
        variant="ghost"
        size="icon"
        className="absolute right-2 top-2 h-6 w-6"
        onClick={handleDismiss}
      >
        <X className="h-4 w-4" />
        <span className="sr-only">Dismiss</span>
      </Button>
    </Alert>
  );
}
