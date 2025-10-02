"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

interface Backstory {
  id: string;
  status: string;
  characterName?: string;
  hair?: string;
  eyes?: string;
  physicalFeatures?: string;
  childhood?: string;
  significantEvent?: string;
  motivation?: string;
  fears?: string;
  relationships?: string;
  goals?: string;
  narrativeBackstory?: string;
  revisionNotes?: string;
  submittedAt?: string;
  reviewedAt?: string;
  campaign: {
    id: string;
    name: string;
    genre?: string;
  };
  world?: {
    id: string;
    name: string;
  };
  player: {
    id: string;
    name?: string;
    email: string;
  };
}

const getStatusColor = (status: string) => {
  switch (status) {
    case 'DRAFT':
      return 'bg-gray-100 text-gray-800';
    case 'SUBMITTED':
      return 'bg-blue-100 text-blue-800';
    case 'UNDER_REVIEW':
      return 'bg-yellow-100 text-yellow-800';
    case 'REVISION_NEEDED':
      return 'bg-orange-100 text-orange-800';
    case 'APPROVED':
      return 'bg-green-100 text-green-800';
    case 'MECHANICAL':
      return 'bg-purple-100 text-purple-800';
    case 'COMPLETE':
      return 'bg-emerald-100 text-emerald-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
};

const getStatusText = (status: string) => {
  switch (status) {
    case 'DRAFT':
      return 'Draft';
    case 'SUBMITTED':
      return 'Submitted for Review';
    case 'UNDER_REVIEW':
      return 'Under GM Review';
    case 'REVISION_NEEDED':
      return 'Revision Needed';
    case 'APPROVED':
      return 'Approved';
    case 'MECHANICAL':
      return 'Converting to Mechanics';
    case 'COMPLETE':
      return 'Complete';
    default:
      return status;
  }
};

export default function BackstoryPage() {
  const params = useParams();
  const router = useRouter();
  const backstoryId = params.id as string;
  const [backstory, setBackstory] = useState<Backstory | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form data for editing
  const [formData, setFormData] = useState({
    characterName: "",
    hair: "",
    eyes: "",
    physicalFeatures: "",
    childhood: "",
    significantEvent: "",
    motivation: "",
    fears: "",
    relationships: "",
    goals: "",
    narrativeBackstory: ""
  });
  const [generatingBackstory, setGeneratingBackstory] = useState(false);

  const fetchBackstory = useCallback(async () => {
    try {
      const response = await fetch(`/api/trailblazer/backstory/${backstoryId}`);
      if (response.ok) {
        const data = await response.json();
        const backstoryData = data.backstory;
        setBackstory(backstoryData);

        // Populate form data
        setFormData({
          characterName: backstoryData.characterName || "",
          hair: backstoryData.hair || "",
          eyes: backstoryData.eyes || "",
          physicalFeatures: backstoryData.physicalFeatures || "",
          childhood: backstoryData.childhood || "",
          significantEvent: backstoryData.significantEvent || "",
          motivation: backstoryData.motivation || "",
          fears: backstoryData.fears || "",
          relationships: backstoryData.relationships || "",
          goals: backstoryData.goals || "",
          narrativeBackstory: backstoryData.narrativeBackstory || ""
        });
      } else if (response.status === 403) {
        router.push('/trailblazer?error=access_denied');
      } else if (response.status === 404) {
        router.push('/trailblazer?error=backstory_not_found');
      }
    } catch (error) {
      console.error("Failed to fetch backstory:", error);
    } finally {
      setLoading(false);
    }
  }, [backstoryId, router]);

  useEffect(() => {
    fetchBackstory();
  }, [fetchBackstory]);

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleGenerateBackstory = async () => {
    if (!backstory?.campaign?.id || !formData.characterName.trim()) {
      alert("Please ensure character name is filled before generating backstory");
      return;
    }

    setGeneratingBackstory(true);
    try {
      const response = await fetch("/api/trailblazer/generate-backstory", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          campaignId: backstory.campaign.id,
          worldId: backstory.world?.id || null,
          ...formData
        })
      });

      if (response.ok) {
        const data = await response.json();
        handleInputChange("narrativeBackstory", data.narrativeBackstory);
      } else {
        const error = await response.json();
        alert(error.error || "Failed to generate backstory. Make sure Ollama is running locally with the llama3.2 model.");
      }
    } catch (error) {
      console.error("Failed to generate backstory:", error);
      alert("Failed to generate backstory. Make sure Ollama is running locally with the llama3.2 model.");
    } finally {
      setGeneratingBackstory(false);
    }
  };

  const handleSave = async () => {
    setSubmitting(true);
    try {
      const response = await fetch(`/api/trailblazer/backstory/${backstoryId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        await fetchBackstory();
        setEditing(false);
      } else {
        const error = await response.json();
        alert(error.error || "Failed to save backstory");
      }
    } catch (error) {
      console.error("Failed to save backstory:", error);
      alert("Failed to save backstory");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitForReview = async () => {
    if (!formData.characterName.trim()) {
      alert("Character name is required before submitting");
      return;
    }

    if (!formData.childhood.trim() && !formData.significantEvent.trim() && !formData.motivation.trim()) {
      alert("Please fill in at least one background story field before submitting");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`/api/trailblazer/backstory/${backstoryId}/submit`, {
        method: "POST"
      });

      if (response.ok) {
        const data = await response.json();
        alert(data.message || "Backstory submitted successfully!");
        await fetchBackstory();
      } else {
        const error = await response.json();
        alert(error.error || "Failed to submit backstory");
      }
    } catch (error) {
      console.error("Failed to submit backstory:", error);
      alert("Failed to submit backstory");
    } finally {
      setSubmitting(false);
    }
  };

  const canEdit = backstory && (backstory.status === 'DRAFT' || backstory.status === 'REVISION_NEEDED');

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!backstory) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Backstory Not Found</h1>
          <Link href="/trailblazer" className="text-indigo-600 hover:text-indigo-500">
            ← Back to Trailblazer Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-growth-gray-50 matrix-bg">
      {/* Header */}
      <header className="growth-page-header shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex justify-between items-center">
            <div>
              <nav className="flex items-center space-x-2 text-sm text-white opacity-90 mb-2">
                <Link href="/trailblazer" className="hover:text-growth-accent-light">
                  Trailblazer
                </Link>
                <span>/</span>
                <span>Character Backstory</span>
              </nav>
              <h1 className="growth-title text-3xl text-white terminal-prompt">
                {backstory.characterName || "Unnamed Character"}
              </h1>
              <div className="flex items-center space-x-4 mt-2">
                <p className="text-white opacity-90">{backstory.campaign.name}</p>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(backstory.status)}`}>
                  {getStatusText(backstory.status)}
                </span>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              {canEdit && !editing && (
                <button
                  onClick={() => setEditing(true)}
                  className="btn-growth-secondary px-4 py-2 text-sm"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Edit
                </button>
              )}
              {editing && (
                <>
                  <button
                    onClick={() => setEditing(false)}
                    className="btn-growth-secondary px-4 py-2 text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={submitting}
                    className="btn-growth-primary px-4 py-2 text-sm"
                  >
                    {submitting ? "Saving..." : "Save Draft"}
                  </button>
                </>
              )}
              <Link
                href="/trailblazer"
                className="btn-growth-secondary px-4 py-2 text-sm"
              >
                ← Back to Dashboard
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Revision Notes */}
        {backstory.revisionNotes && (
          <div className="growth-card p-6 mb-8 border-l-4 border-orange-400">
            <div className="growth-card-header -m-6 mb-4">
              <h2 className="growth-title text-lg text-white flex items-center">
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 15.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                GM Feedback - Revision Needed
              </h2>
            </div>
            <p className="growth-body whitespace-pre-wrap">{backstory.revisionNotes}</p>
          </div>
        )}

        {/* Character Identity */}
        <div className="growth-card p-6 mb-8">
          <div className="growth-card-header -m-6 mb-6">
            <h2 className="growth-title text-xl text-white">Character Identity</h2>
          </div>

          {editing ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="growth-label">Character Name *</label>
                <input
                  type="text"
                  value={formData.characterName}
                  onChange={(e) => handleInputChange("characterName", e.target.value)}
                  className="growth-input"
                />
              </div>

              <div>
                <label className="growth-label">Hair</label>
                <input
                  type="text"
                  value={formData.hair}
                  onChange={(e) => handleInputChange("hair", e.target.value)}
                  className="growth-input"
                />
              </div>

              <div>
                <label className="growth-label">Eyes</label>
                <input
                  type="text"
                  value={formData.eyes}
                  onChange={(e) => handleInputChange("eyes", e.target.value)}
                  className="growth-input"
                />
              </div>

              <div>
                {/* Empty div to maintain grid layout */}
              </div>

              <div className="md:col-span-2">
                <label className="growth-label">Physical Features</label>
                <textarea
                  value={formData.physicalFeatures}
                  onChange={(e) => handleInputChange("physicalFeatures", e.target.value)}
                  className="growth-input"
                  rows={3}
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="growth-subtitle text-sm">Character Name</h4>
                <p className="growth-body">{backstory.characterName || "Not specified"}</p>
              </div>


              {backstory.hair && (
                <div>
                  <h4 className="growth-subtitle text-sm">Hair</h4>
                  <p className="growth-body">{backstory.hair}</p>
                </div>
              )}

              {backstory.eyes && (
                <div>
                  <h4 className="growth-subtitle text-sm">Eyes</h4>
                  <p className="growth-body">{backstory.eyes}</p>
                </div>
              )}

              {backstory.physicalFeatures && (
                <div className="md:col-span-2">
                  <h4 className="growth-subtitle text-sm">Physical Features</h4>
                  <p className="growth-body whitespace-pre-wrap">{backstory.physicalFeatures}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Character Background */}
        <div className="growth-card p-6 mb-8">
          <div className="growth-card-header -m-6 mb-6">
            <h2 className="growth-title text-xl text-white">Character Background</h2>
          </div>

          <div className="space-y-6">
            {editing ? (
              <>
                <div>
                  <label className="growth-label">Childhood & Early Life</label>
                  <textarea
                    value={formData.childhood}
                    onChange={(e) => handleInputChange("childhood", e.target.value)}
                    className="growth-input"
                    rows={4}
                  />
                </div>

                <div>
                  <label className="growth-label">Significant Event</label>
                  <textarea
                    value={formData.significantEvent}
                    onChange={(e) => handleInputChange("significantEvent", e.target.value)}
                    className="growth-input"
                    rows={4}
                  />
                </div>

                <div>
                  <label className="growth-label">Motivation & Goals</label>
                  <textarea
                    value={formData.motivation}
                    onChange={(e) => handleInputChange("motivation", e.target.value)}
                    className="growth-input"
                    rows={3}
                  />
                </div>

                <div>
                  <label className="growth-label">Fears & Weaknesses</label>
                  <textarea
                    value={formData.fears}
                    onChange={(e) => handleInputChange("fears", e.target.value)}
                    className="growth-input"
                    rows={3}
                  />
                </div>

                <div>
                  <label className="growth-label">Important Relationships</label>
                  <textarea
                    value={formData.relationships}
                    onChange={(e) => handleInputChange("relationships", e.target.value)}
                    className="growth-input"
                    rows={3}
                  />
                </div>

                <div>
                  <label className="growth-label">Goals & Aspirations</label>
                  <textarea
                    value={formData.goals}
                    onChange={(e) => handleInputChange("goals", e.target.value)}
                    className="growth-input"
                    rows={3}
                  />
                </div>
              </>
            ) : (
              <>
                {backstory.childhood && (
                  <div>
                    <h4 className="growth-subtitle text-sm mb-2">Childhood & Early Life</h4>
                    <p className="growth-body whitespace-pre-wrap">{backstory.childhood}</p>
                  </div>
                )}

                {backstory.significantEvent && (
                  <div>
                    <h4 className="growth-subtitle text-sm mb-2">Significant Event</h4>
                    <p className="growth-body whitespace-pre-wrap">{backstory.significantEvent}</p>
                  </div>
                )}

                {backstory.motivation && (
                  <div>
                    <h4 className="growth-subtitle text-sm mb-2">Motivation & Goals</h4>
                    <p className="growth-body whitespace-pre-wrap">{backstory.motivation}</p>
                  </div>
                )}

                {backstory.fears && (
                  <div>
                    <h4 className="growth-subtitle text-sm mb-2">Fears & Weaknesses</h4>
                    <p className="growth-body whitespace-pre-wrap">{backstory.fears}</p>
                  </div>
                )}

                {backstory.relationships && (
                  <div>
                    <h4 className="growth-subtitle text-sm mb-2">Important Relationships</h4>
                    <p className="growth-body whitespace-pre-wrap">{backstory.relationships}</p>
                  </div>
                )}

                {backstory.goals && (
                  <div>
                    <h4 className="growth-subtitle text-sm mb-2">Goals & Aspirations</h4>
                    <p className="growth-body whitespace-pre-wrap">{backstory.goals}</p>
                  </div>
                )}

                {!backstory.childhood && !backstory.significantEvent && !backstory.motivation &&
                 !backstory.fears && !backstory.relationships && !backstory.goals && (
                  <p className="growth-body text-growth-gray-600 italic">
                    No background story details provided yet.
                  </p>
                )}
              </>
            )}
          </div>
        </div>

        {/* Complete Backstory */}
        <div className="growth-card p-6 terminal-scan-line">
          <div className="growth-card-header -m-6 mb-6">
            <h2 className="growth-title text-xl text-white">Complete Backstory</h2>
            <p className="text-white opacity-80 text-sm mt-1">
              AI-generated or custom narrative backstory for your character
            </p>
          </div>

          {editing ? (
            <div className="space-y-4">
              <div className="flex justify-end mb-4">
                <button
                  type="button"
                  onClick={handleGenerateBackstory}
                  disabled={generatingBackstory || !formData.characterName.trim()}
                  className="w-10 h-10 rounded-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50 flex items-center justify-center transition-all duration-200 transform hover:scale-105"
                  title={generatingBackstory ? "Generating..." : "Generate with AI"}
                >
                  {generatingBackstory ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                  ) : (
                    <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2zm0 2.78L9.73 9.64 4.47 10.4l4 3.9-.95 5.53L12 17.49l4.48 2.34-.95-5.53 4-3.9-5.26-.76L12 4.78z" />
                      <circle cx="12" cy="12" r="3" fill="currentColor" opacity="0.8"/>
                      <path d="M8 12h8M12 8v8M10.5 10.5l3 3M13.5 10.5l-3 3" stroke="currentColor" strokeWidth="1" opacity="0.6"/>
                    </svg>
                  )}
                </button>
              </div>

              <div>
                <label className="growth-label">Character Backstory</label>
                <textarea
                  name="narrativeBackstory"
                  value={formData.narrativeBackstory || ""}
                  onChange={(e) => handleInputChange("narrativeBackstory", e.target.value)}
                  className="growth-input"
                  rows={12}
                  placeholder="Write your character's complete backstory here, or use the AI generator above to create one based on your details..."
                />
              </div>
            </div>
          ) : (
            <>
              {backstory.narrativeBackstory ? (
                <div className="prose prose-sm max-w-none">
                  <div className="whitespace-pre-wrap text-growth-gray-700 leading-relaxed">
                    {backstory.narrativeBackstory}
                  </div>
                </div>
              ) : (
                <p className="growth-body text-growth-gray-500 italic text-center py-8">
                  No complete backstory provided yet.
                </p>
              )}
            </>
          )}
        </div>

        {/* Submit for Review */}
        {canEdit && !editing && (
          <div className="growth-card p-6 terminal-scan-line">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="growth-subtitle text-lg mb-2">Ready to Submit?</h3>
                <p className="growth-body text-sm text-growth-gray-600">
                  Once submitted, your GM will review your backstory and provide feedback or approval.
                </p>
              </div>
              <button
                onClick={handleSubmitForReview}
                disabled={submitting}
                className="btn-growth-primary px-6 py-3"
              >
                {submitting ? "Submitting..." : "Submit for GM Review"}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}