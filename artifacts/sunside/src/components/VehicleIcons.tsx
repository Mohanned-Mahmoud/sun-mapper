import { Bus, Car, TrainFront, TrainTrack, CarFront } from "lucide-react";
import type { VehicleType } from "@workspace/api-client-react";

export function VehicleIcon({ type, className = "w-5 h-5" }: { type: typeof VehicleType[keyof typeof VehicleType], className?: string }) {
  switch (type) {
    case "Bus":
      return <Bus className={className} />;
    case "Microbus":
      return <CarFront className={className} />;
    case "Car":
      return <Car className={className} />;
    case "Train":
      return <TrainFront className={className} />;
    case "Metro":
      return <TrainTrack className={className} />;
    default:
      return <Bus className={className} />;
  }
}
