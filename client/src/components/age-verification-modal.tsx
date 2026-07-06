import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, Calendar, Shield, ChevronDown } from "lucide-react";

interface AgeVerificationModalProps {
  isOpen: boolean;
  onVerified: () => void;
  onDeclined: () => void;
}

export function AgeVerificationModal({ isOpen, onVerified, onDeclined }: AgeVerificationModalProps) {
  const [selectedAge, setSelectedAge] = useState<string>("");
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);

  const ageOptions = [
    { value: "", label: "Select your age..." },
    { value: "under18", label: "Under 18" },
    { value: "18-24", label: "18-24" },
    { value: "25-34", label: "25-34" },
    { value: "35-44", label: "35-44" },
    { value: "45-54", label: "45-54" },
    { value: "55+", label: "55+" }
  ];

  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent 
        className="max-w-[95vw] sm:max-w-md max-h-[95vh] overflow-y-auto p-4 sm:p-6 [&>button]:hidden"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader className="text-center">
          <div className="mx-auto mb-2 sm:mb-4 flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-900">
            <AlertTriangle className="h-5 w-5 sm:h-6 sm:w-6 text-orange-600 dark:text-orange-400" />
          </div>
          <DialogTitle className="text-lg sm:text-xl font-semibold">
            Adult Content Warning
          </DialogTitle>
        </DialogHeader>

        <Card className="border-orange-200 dark:border-orange-800">
          <CardHeader className="pb-3 sm:pb-4">
            <CardDescription className="text-sm">
              This website contains adult content and is intended for mature audiences only.
            </CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-3 sm:space-y-4">
            <div className="bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-800 rounded-lg p-3 sm:p-4">
              <p className="text-sm text-orange-800 dark:text-orange-200 mb-2 sm:mb-3">
                By continuing, you confirm that you:
              </p>
              <ul className="text-xs text-orange-700 dark:text-orange-300 space-y-1 ml-3 sm:ml-4">
                <li>• Are at least 18 years of age</li>
                <li>• Understand this site contains adult AI-generated imagery</li>
                <li>• Are legally permitted to view such content in your jurisdiction</li>
                <li>• Consent to viewing explicit AI-generated content</li>
              </ul>
            </div>

            <div className="space-y-3 relative">
              <label className="block text-sm font-medium">
                <Calendar className="inline h-4 w-4 mr-2" />
                Please confirm your age:
              </label>
              
              {/* Custom Dropdown */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  className="w-full p-3 border border-gray-300 rounded-lg bg-white text-black text-sm text-left flex items-center justify-between"
                  data-testid="age-select"
                >
                  <span>
                    {ageOptions.find(option => option.value === selectedAge)?.label || "Select your age..."}
                  </span>
                  <ChevronDown className={`h-4 w-4 text-gray-500 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
                
                {isDropdownOpen && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg z-50">
                    {ageOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => {
                          setSelectedAge(option.value);
                          setIsDropdownOpen(false);
                        }}
                        className={`w-full p-3 text-left text-black hover:bg-gray-100 first:rounded-t-lg last:rounded-b-lg ${
                          option.value === "under18" ? "text-gray-400 cursor-not-allowed" : "cursor-pointer"
                        }`}
                        disabled={option.value === "under18"}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 pt-3 sm:pt-4">
              <Button 
                variant="outline" 
                onClick={onDeclined}
                className="flex-1 text-gray-700 border-gray-300 hover:bg-gray-50 text-sm"
                data-testid="button-decline"
              >
                I'm Under 18 / Decline
              </Button>
              <Button 
                onClick={onVerified}
                disabled={selectedAge === "" || selectedAge === "under18"}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white disabled:bg-gray-400 disabled:cursor-not-allowed text-sm"
                data-testid="button-verify"
              >
                I'm 18+ / Enter Site
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="text-center mt-4">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            This verification is required by law and helps protect minors from adult content.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}