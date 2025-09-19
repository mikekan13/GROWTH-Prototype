"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Campaign {
  id: string;
  name: string;
  genre?: string;
  themes?: string;
  description?: string;
  worlds: World[];
}

interface World {
  id: string;
  name: string;
  description?: string;
  worldType: string;
}

export default function CreateCharacterPage() {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<string>("");
  const [selectedWorld, setSelectedWorld] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Character form data
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

  useEffect(() => {
    fetchCampaigns();
  }, []);

  const fetchCampaigns = async () => {
    try {
      const response = await fetch("/api/trailblazer/campaigns");
      if (response.ok) {
        const data = await response.json();
        setCampaigns(data.campaigns || []);
      }
    } catch (error) {
      console.error("Failed to fetch campaigns:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleGenerateBackstory = async () => {
    if (!selectedCampaign || !formData.characterName.trim()) {
      alert("Please select a campaign and enter a character name first");
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
          campaignId: selectedCampaign,
          worldId: selectedWorld || null,
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedCampaign) {
      alert("Please select a campaign");
      return;
    }

    if (!formData.characterName.trim()) {
      alert("Character name is required");
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch("/api/trailblazer/backstory", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          campaignId: selectedCampaign,
          worldId: selectedWorld || null,
          ...formData
        })
      });

      if (response.ok) {
        const data = await response.json();
        router.push(`/trailblazer/backstory/${data.backstory.id}`);
      } else {
        const error = await response.json();
        alert(error.error || "Failed to create character backstory");
      }
    } catch (error) {
      console.error("Failed to create backstory:", error);
      alert("Failed to create character backstory");
    } finally {
      setSubmitting(false);
    }
  };

  const selectedCampaignData = campaigns.find(c => c.id === selectedCampaign);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
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
                <span>Create Character</span>
              </nav>
              <h1 className="growth-title text-3xl text-white terminal-prompt">Create New Character</h1>
              <p className="text-white opacity-90 mt-1">
                Start your adventure by crafting your character&apos;s backstory
              </p>
            </div>
            <div>
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
        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Campaign Selection */}
          <div className="growth-card p-6 terminal-scan-line">
            <div className="growth-card-header -m-6 mb-6">
              <h2 className="growth-title text-xl text-white">Select Campaign</h2>
            </div>

            {campaigns.length === 0 ? (
              <div className="text-center py-8">
                <h3 className="growth-subtitle text-lg mb-2">No Active Campaigns</h3>
                <p className="growth-body text-growth-gray-600">
                  There are no campaigns currently accepting new characters. Please check back later.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {campaigns.map((campaign) => (
                  <div key={campaign.id} className="border rounded-lg p-4">
                    <label className="flex items-start space-x-3 cursor-pointer">
                      <input
                        type="radio"
                        name="campaign"
                        value={campaign.id}
                        checked={selectedCampaign === campaign.id}
                        onChange={(e) => setSelectedCampaign(e.target.value)}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <h3 className="growth-title text-lg">{campaign.name}</h3>
                        {campaign.genre && (
                          <p className="growth-body text-sm text-growth-gray-600 mt-1">
                            <strong>Genre:</strong> {campaign.genre}
                          </p>
                        )}
                        {campaign.themes && (
                          <p className="growth-body text-sm text-growth-gray-600">
                            <strong>Themes:</strong> {campaign.themes}
                          </p>
                        )}
                        {campaign.description && (
                          <p className="growth-body text-sm text-growth-gray-700 mt-2">
                            {campaign.description}
                          </p>
                        )}
                      </div>
                    </label>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* World Selection (if available) */}
          {selectedCampaignData && selectedCampaignData.worlds.length > 0 && (
            <div className="growth-card p-6 terminal-scan-line">
              <div className="growth-card-header -m-6 mb-6">
                <h2 className="growth-title text-xl text-white">Select Origin World (Optional)</h2>
              </div>

              <div className="space-y-3">
                <label className="flex items-start space-x-3 cursor-pointer">
                  <input
                    type="radio"
                    name="world"
                    value=""
                    checked={selectedWorld === ""}
                    onChange={() => setSelectedWorld("")}
                    className="mt-1"
                  />
                  <div>
                    <h4 className="growth-subtitle">Unknown Origin</h4>
                    <p className="growth-body text-sm text-growth-gray-600">
                      Let the GM decide or reveal later
                    </p>
                  </div>
                </label>

                {selectedCampaignData.worlds.map((world) => (
                  <label key={world.id} className="flex items-start space-x-3 cursor-pointer">
                    <input
                      type="radio"
                      name="world"
                      value={world.id}
                      checked={selectedWorld === world.id}
                      onChange={(e) => setSelectedWorld(e.target.value)}
                      className="mt-1"
                    />
                    <div>
                      <h4 className="growth-subtitle">{world.name}</h4>
                      <p className="growth-body text-xs text-growth-gray-500">{world.worldType}</p>
                      {world.description && (
                        <p className="growth-body text-sm text-growth-gray-600 mt-1">
                          {world.description}
                        </p>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Character Identity */}
          <div className="growth-card p-6 terminal-scan-line">
            <div className="growth-card-header -m-6 mb-6">
              <h2 className="growth-title text-xl text-white">Character Identity</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="growth-label">Character Name *</label>
                <input
                  type="text"
                  value={formData.characterName}
                  onChange={(e) => handleInputChange("characterName", e.target.value)}
                  className="growth-input"
                  required
                />
              </div>

              <div>
                <label className="growth-label">Hair</label>
                <input
                  type="text"
                  value={formData.hair}
                  onChange={(e) => handleInputChange("hair", e.target.value)}
                  className="growth-input"
                  placeholder="e.g., Black, curly"
                />
              </div>

              <div>
                <label className="growth-label">Eyes</label>
                <input
                  type="text"
                  value={formData.eyes}
                  onChange={(e) => handleInputChange("eyes", e.target.value)}
                  className="growth-input"
                  placeholder="e.g., Brown, piercing"
                />
              </div>

              <div className="md:col-span-3">
                <label className="growth-label">Physical Features</label>
                <textarea
                  value={formData.physicalFeatures}
                  onChange={(e) => handleInputChange("physicalFeatures", e.target.value)}
                  className="growth-input"
                  rows={2}
                  placeholder="Notable physical traits, scars, clothing style, mannerisms..."
                />
              </div>
            </div>
          </div>

          {/* Character Background Details */}
          <div className="growth-card p-6 terminal-scan-line">
            <div className="growth-card-header -m-6 mb-6">
              <h2 className="growth-title text-xl text-white">Character Background Details</h2>
              <p className="text-white opacity-80 text-sm mt-1">
                Fill in key details that define your character (used for AI generation)
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="growth-label">Childhood & Early Life</label>
                <textarea
                  value={formData.childhood}
                  onChange={(e) => handleInputChange("childhood", e.target.value)}
                  className="growth-input"
                  rows={3}
                  placeholder="Where did they grow up? Family background? Formative experiences?"
                />
              </div>

              <div>
                <label className="growth-label">Significant Event</label>
                <textarea
                  value={formData.significantEvent}
                  onChange={(e) => handleInputChange("significantEvent", e.target.value)}
                  className="growth-input"
                  rows={3}
                  placeholder="Key moment that shaped them? Tragedy, triumph, discovery?"
                />
              </div>

              <div>
                <label className="growth-label">Motivation & Goals</label>
                <textarea
                  value={formData.motivation}
                  onChange={(e) => handleInputChange("motivation", e.target.value)}
                  className="growth-input"
                  rows={3}
                  placeholder="What drives them? What do they seek to achieve?"
                />
              </div>

              <div>
                <label className="growth-label">Fears & Weaknesses</label>
                <textarea
                  value={formData.fears}
                  onChange={(e) => handleInputChange("fears", e.target.value)}
                  className="growth-input"
                  rows={3}
                  placeholder="What do they fear? Vulnerabilities or flaws?"
                />
              </div>

              <div>
                <label className="growth-label">Important Relationships</label>
                <textarea
                  value={formData.relationships}
                  onChange={(e) => handleInputChange("relationships", e.target.value)}
                  className="growth-input"
                  rows={3}
                  placeholder="Family, friends, mentors, rivals, enemies?"
                />
              </div>

              <div>
                <label className="growth-label">Goals & Aspirations</label>
                <textarea
                  value={formData.goals}
                  onChange={(e) => handleInputChange("goals", e.target.value)}
                  className="growth-input"
                  rows={3}
                  placeholder="Short and long-term ambitions?"
                />
              </div>
            </div>
          </div>

          {/* AI-Generated Narrative Backstory */}
          <div className="growth-card p-6 terminal-scan-line">
            <div className="growth-card-header -m-6 mb-6">
              <h2 className="growth-title text-xl text-white">Complete Backstory</h2>
              <p className="text-white opacity-80 text-sm mt-1">
                Generate or write a complete narrative backstory for your character
              </p>
            </div>

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
                  value={formData.narrativeBackstory}
                  onChange={(e) => handleInputChange("narrativeBackstory", e.target.value)}
                  className="growth-input"
                  rows={12}
                  placeholder="Write your character's complete backstory here, or use the AI generator above to create one based on your details..."
                />
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <div className="growth-card p-6 terminal-scan-line">
            <div className="flex justify-between items-center">
              <p className="growth-body text-sm text-growth-gray-600">
                Your backstory will be saved as a draft. You can edit it before submitting to your GM for review.
              </p>
              <button
                type="submit"
                disabled={submitting || !selectedCampaign}
                className="btn-growth-primary px-6 py-3"
              >
                {submitting ? "Creating..." : "Create Character Backstory"}
              </button>
            </div>
          </div>
        </form>
      </main>
    </div>
  );
}