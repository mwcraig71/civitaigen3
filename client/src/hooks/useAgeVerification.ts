import { useState, useEffect } from "react";

const AGE_VERIFICATION_KEY = "ageVerified";
const VERIFICATION_EXPIRY_KEY = "ageVerificationExpiry";
const VERIFICATION_DURATION = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds

export function useAgeVerification() {
  const [isVerified, setIsVerified] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    checkVerificationStatus();
  }, []);

  const checkVerificationStatus = () => {
    try {
      const verified = localStorage.getItem(AGE_VERIFICATION_KEY);
      const expiry = localStorage.getItem(VERIFICATION_EXPIRY_KEY);
      
      if (verified === "true" && expiry) {
        const expiryDate = new Date(parseInt(expiry));
        const now = new Date();
        
        if (now < expiryDate) {
          setIsVerified(true);
        } else {
          // Verification expired, clear storage
          clearVerification();
        }
      }
    } catch (error) {
      console.error("Error checking age verification:", error);
      clearVerification();
    } finally {
      setIsLoading(false);
    }
  };

  const setVerified = () => {
    try {
      const expiryDate = new Date(Date.now() + VERIFICATION_DURATION);
      localStorage.setItem(AGE_VERIFICATION_KEY, "true");
      localStorage.setItem(VERIFICATION_EXPIRY_KEY, expiryDate.getTime().toString());
      setIsVerified(true);
    } catch (error) {
      console.error("Error setting age verification:", error);
    }
  };

  const clearVerification = () => {
    try {
      localStorage.removeItem(AGE_VERIFICATION_KEY);
      localStorage.removeItem(VERIFICATION_EXPIRY_KEY);
      setIsVerified(false);
    } catch (error) {
      console.error("Error clearing age verification:", error);
    }
  };

  const handleDecline = () => {
    clearVerification();
    // Redirect to a safe page or show a message
    window.location.href = "https://www.google.com";
  };

  return {
    isVerified,
    isLoading,
    setVerified,
    clearVerification,
    handleDecline
  };
}