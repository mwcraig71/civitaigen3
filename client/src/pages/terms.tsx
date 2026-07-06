import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";

export default function Terms() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto mb-6">
          <Link href="/">
            <Button variant="ghost" size="sm" className="flex items-center gap-2" data-testid="button-back">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          </Link>
        </div>
        <Card className="max-w-4xl mx-auto">
          <CardHeader>
            <CardTitle className="text-3xl font-bold text-center">
              Terms and Conditions for CiviVerse.com
            </CardTitle>
            <p className="text-center text-muted-foreground">
              Last Updated: August 26, 2025
            </p>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[600px] w-full">
              <div className="space-y-6 pr-4">
                <div>
                  <p className="mb-4">
                    Welcome to CiviVerse.com (the "Platform"). These Terms and Conditions ("Terms") govern your access to and use of our AI image generation services, website, and any related applications (collectively, the "Service").
                  </p>
                  <p className="mb-4">
                    By accessing or using our Service, you agree to be bound by these Terms and our Privacy Policy. If you do not agree to these Terms, you may not access or use the Service.
                  </p>
                </div>

                <div>
                  <h2 className="text-xl font-semibold mb-3">1. Acceptance of Terms & Age Requirement</h2>
                  <div className="space-y-2">
                    <p><strong>1.1. Age of Majority:</strong> This Service is intended exclusively for adults. You must be at least 18 years of age and the age of legal majority in your jurisdiction to create an account or use the Service.</p>
                    <p><strong>1.2. Legal Affirmation:</strong> By using this Service, you affirm that you are of legal age and that you are not legally prohibited from viewing or creating adult content in your location. You are solely responsible for compliance with all local laws applicable to you.</p>
                    <p><strong>1.3. Access by Minors:</strong> You agree not to allow any minor to access or view content on this Platform. We do not knowingly collect information from minors.</p>
                  </div>
                </div>

                <div>
                  <h2 className="text-xl font-semibold mb-3">2. Description of Service</h2>
                  <p>
                    CiviVerse.com provides users with access to advanced AI models to generate digital images and artwork ("Generations"). The Service includes community features allowing users to share and discover Generations.
                  </p>
                </div>

                <div>
                  <h2 className="text-xl font-semibold mb-3">3. Beta Platform Notice</h2>
                  <p className="mb-2">The Service is currently in a beta testing phase. You acknowledge and agree that:</p>
                  <ul className="list-disc pl-6 space-y-1">
                    <li>The Service is experimental and may contain bugs, errors, or inaccuracies.</li>
                    <li>Service interruptions or data loss may occur unexpectedly.</li>
                    <li>We reserve the right to modify or discontinue the Service at any time without notice.</li>
                    <li>Your use of the beta Service is entirely at your own risk. We shall not be liable for any damages or losses arising from your use of the Service.</li>
                  </ul>
                </div>

                <div>
                  <h2 className="text-xl font-semibold mb-3">4. User Conduct and Responsibilities</h2>
                  <div className="space-y-2">
                    <p><strong>4.1. Account Security:</strong> You are responsible for maintaining the confidentiality of your account login information and for all activities that occur under your account.</p>
                    <p><strong>4.2. Acceptable Use:</strong> You agree to use the Service in a lawful manner and in compliance with these Terms. You are responsible for the text prompts you enter and the Generations you create.</p>
                    <p><strong>4.3. Prohibited Content and Actions:</strong> You are strictly prohibited from creating, uploading, or sharing any content that:</p>
                    <ul className="list-disc pl-6 space-y-1 mt-2">
                      <li>Depicts or involves minors in any sexual or suggestive way (Child Sexual Abuse Material - CSAM).</li>
                      <li>Infringes on the intellectual property rights of any third party, including copyrights and trademarks. This includes generating images of copyrighted characters or artworks without permission.</li>
                      <li>Attempts to generate photorealistic images of real people, public figures, or private individuals, especially in an explicit or defamatory context, without their explicit consent.</li>
                      <li>Constitutes hate speech, harassment, or is defamatory, threatening, or discriminatory.</li>
                      <li>Violates the privacy or publicity rights of any individual.</li>
                      <li>Contains malicious code, viruses, or any other harmful software.</li>
                      <li>Attempts to reverse-engineer, decompile, or otherwise discover the source code or underlying components of our models and systems.</li>
                    </ul>
                    <p className="mt-2">
                      We reserve the right, but not the obligation, to monitor user activity and content. Any violation of these terms may result in immediate account suspension or termination, and the removal of content, without notice.
                    </p>
                  </div>
                </div>

                <div>
                  <h2 className="text-xl font-semibold mb-3">5. Intellectual Property and Content Ownership</h2>
                  <div className="space-y-2">
                    <p><strong>5.1. Your Prompts and Generations:</strong> Subject to Section 5.2, you own the rights to the specific text prompts you create and the resulting unique Generations. You grant us a worldwide, non-exclusive, royalty-free license to use, reproduce, display, and distribute your publicly shared Generations for the purposes of operating, promoting, and improving the Service.</p>
                    <p><strong>5.2. Our Service and Models:</strong> We retain all rights, title, and interest in and to the Service, including our AI models, software, website design, and all associated intellectual property. Your use of the Service does not grant you any ownership rights in our underlying technology.</p>
                    <p><strong>5.3. DMCA and Copyright Policy:</strong> We respect the intellectual property of others. If you believe your copyright has been infringed upon by content on our Platform, please contact us with a valid DMCA takedown notice.</p>
                  </div>
                </div>

                <div>
                  <h2 className="text-xl font-semibold mb-3">6. Disclaimers and Limitation of Liability</h2>
                  <div className="space-y-2">
                    <p><strong>6.1. "AS IS" Service:</strong> THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING, BUT NOT LIMITED TO, IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.</p>
                    <p><strong>6.2. No Guarantee of Accuracy:</strong> We do not warrant that the Generations will meet your requirements or that they will be accurate, reliable, or free from artifacts or biases. AI-generated content can be unpredictable.</p>
                    <p><strong>6.3. Limitation of Liability:</strong> TO THE FULLEST EXTENT PERMITTED BY LAW, CIVIIVERSE, ITS AFFILIATES, AND ITS PERSONNEL SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS OR REVENUES, WHETHER INCURRED DIRECTLY OR INDIRECTLY, OR ANY LOSS OF DATA, USE, GOODWILL, OR OTHER INTANGIBLE LOSSES, RESULTING FROM (A) YOUR ACCESS TO OR USE OF OR INABILITY TO ACCESS OR USE THE SERVICE; (B) ANY CONDUCT OR CONTENT OF ANY THIRD PARTY ON THE SERVICE.</p>
                  </div>
                </div>

                <div>
                  <h2 className="text-xl font-semibold mb-3">7. Indemnification</h2>
                  <p>
                    You agree to defend, indemnify, and hold harmless CiviVerse and its employees, directors, and agents from and against any claims, damages, obligations, losses, liabilities, costs, or debt, and expenses (including but not limited to attorney's fees) arising from:
                  </p>
                  <ul className="list-disc pl-6 space-y-1 mt-2">
                    <li>Your use of and access to the Service.</li>
                    <li>Your violation of any term of these Terms.</li>
                    <li>Your violation of any third-party right, including without limitation any copyright, property, or privacy right.</li>
                    <li>Any claim that your Generations caused damage to a third party.</li>
                  </ul>
                </div>

                <div>
                  <h2 className="text-xl font-semibold mb-3">8. Termination</h2>
                  <p>
                    We may terminate or suspend your account and bar access to the Service immediately, without prior notice or liability, for any reason whatsoever, including without limitation if you breach the Terms.
                  </p>
                </div>

                <div>
                  <h2 className="text-xl font-semibold mb-3">9. Governing Law</h2>
                  <p>
                    These Terms shall be governed and construed in accordance with the laws of Nevada, without regard to its conflict of law provisions.
                  </p>
                </div>

                <div>
                  <h2 className="text-xl font-semibold mb-3">10. Changes to Terms</h2>
                  <p>
                    We reserve the right, at our sole discretion, to modify or replace these Terms at any time. We will provide notice of material changes. By continuing to access or use our Service after any revisions become effective, you agree to be bound by the revised terms.
                  </p>
                </div>

                <div>
                  <h2 className="text-xl font-semibold mb-3">11. Contact Us</h2>
                  <p>
                    If you have any questions about these Terms, please contact us.
                  </p>
                </div>
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}