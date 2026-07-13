import { useState } from "react";

const AGE_VERIFICATION_KEY = "ageVerified";
const VERIFICATION_EXPIRY_KEY = "ageVerificationExpiry";
const VERIFICATION_DURATION = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds

function checkLocalStorage(): boolean {
  try {
    const verified = localStorage.getItem(AGE_VERIFICATION_KEY);
    const expiry = localStorage.getItem(VERIFICATION_EXPIRY_KEY);
    if (verified === "true" && expiry) {
      const expiryDate = new Date(parseInt(expiry));
      if (new Date() < expiryDate) return true;
    }
  } catch {
    // localStorage unavailable
  }
  return false;
}

export function useAgeVerification() {
  const [isVerified, setIsVerifiedState] = useState<boolean>(() => checkLocalStorage());

  const setVerified = () => {
    try {
      const expiryDate = new Date(Date.now() + VERIFICATION_DURATION);
      localStorage.setItem(AGE_VERIFICATION_KEY, "true");
      localStorage.setItem(VERIFICATION_EXPIRY_KEY, expiryDate.getTime().toString());
      setIsVerifiedState(true);
    } catch (error) {
      console.error("Error setting age verification:", error);
    }
  };

  const clearVerification = () => {
    try {
      localStorage.removeItem(AGE_VERIFICATION_KEY);
      localStorage.removeItem(VERIFICATION_EXPIRY_KEY);
      setIsVerifiedState(false);
    } catch (error) {
      console.error("Error clearing age verification:", error);
    }
  };

  const handleDecline = () => {
    clearVerification();
    window.location.href = "https://www.google.com";
  };

  return {
    isVerified,
    isLoading: false,
    setVerified,
    clearVerification,
    handleDecline
  };
}
