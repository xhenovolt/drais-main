"use client";
import React, { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Swal from "sweetalert2";
import { useSchoolConfig } from "@/hooks/useSchoolConfig";

const FingerprintAuthPage: React.FC = () => {
  const searchParams = useSearchParams();
  const studentId = searchParams.get("student_id");
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const { school } = useSchoolConfig();

  const handleFingerprintAuth = async () => {
    if (!studentId) {
      Swal.fire("Error", "Student ID is missing.", "error");
      return;
    }

    try {
      setIsAuthenticating(true);

      // Check if the browser supports the Web Authentication API
      if (!window.PublicKeyCredential) {
        Swal.fire("Error", "Your device does not support fingerprint authentication.", "error");
        setIsAuthenticating(false);
        return;
      }

      // Simulate fingerprint authentication using WebAuthn
      const credential = await navigator.credentials.create({
        publicKey: {
          challenge: new Uint8Array(32), // Random challenge
          rp: { name: school.name || "School" },
          user: {
            id: new Uint8Array(16), // Random user ID
            name: `student-${studentId}`,
            displayName: `Student ${studentId}`,
          },
          pubKeyCredParams: [{ type: "public-key", alg: -7 }], // ECDSA with SHA-256
          authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required" },
          timeout: 60000,
        },
      });

      if (credential) {
        // Send the fingerprint data to the server
        const response = await fetch("/api/fingerprint", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            student_id: studentId,
            method: "phone",
            credential: JSON.stringify(credential),
          }),
        });

        const result = await response.json();
        if (result.success) {
          Swal.fire("Success", "Fingerprint added successfully!", "success");
        } else {
          Swal.fire("Error", result.error || "Failed to add fingerprint.", "error");
        }
      } else {
        Swal.fire("Error", "Fingerprint authentication failed.", "error");
      }
    } catch (error) {
      console.error("Fingerprint authentication error:", error);
      Swal.fire("Error", "An error occurred during fingerprint authentication.", "error");
    } finally {
      setIsAuthenticating(false);
    }
  };

  useEffect(() => {
    handleFingerprintAuth();
  }, []);

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="text-center">
        {isAuthenticating ? (
          <p className="text-lg font-semibold">Authenticating fingerprint...</p>
        ) : (
          <p className="text-lg font-semibold">Please wait...</p>
        )}
      </div>
    </div>
  );
};

export default FingerprintAuthPage;
