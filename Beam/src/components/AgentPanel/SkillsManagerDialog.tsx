import React, { useState, useRef } from 'react';
import { JsonSkill } from '../../types';

interface SkillsManagerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  skills: JsonSkill[];
  onImportSkills: (skills: JsonSkill[]) => void;
  onDeleteSkill: (skillId: string) => void;
}

export function SkillsManagerDialog({
  isOpen,
  onClose,
  skills,
  onImportSkills,
  onDeleteSkill
}: SkillsManagerDialogProps) {
  const [activeTab, setActiveTab] = useState<'list' | 'import'>('list');
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImportError(null);

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      const skillsToImport: JsonSkill[] = Array.isArray(data) ? data : [data];

      const validSkills = skillsToImport.filter(skill => 
        skill.id && skill.name && skill.description
      );

      if (validSkills.length === 0) {
        setImportError('No valid skills found in the file.');
        return;
      }

      onImportSkills(validSkills);
      setActiveTab('list');
      
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err) {
      setImportError('Failed to parse JSON file. Please check the format.');
    }
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="skills-manager-dialog" onClick={e => e.stopPropagation()}>
        <div className="dialog-header">
          <h3>Manage Skills</h3>
          <button className="dialog-close" onClick={onClose}>×</button>
        </div>

        <div className="dialog-tabs">
          <button 
            className={activeTab === 'list' ? 'active' : ''} 
            onClick={() => setActiveTab('list')}
          >
            My Skills ({skills.length})
          </button>
          <button 
            className={activeTab === 'import' ? 'active' : ''} 
            onClick={() => setActiveTab('import')}
          >
            Import
          </button>
        </div>

        <div className="dialog-content">
          {activeTab === 'list' && (
            <div className="skills-list">
              {skills.length === 0 ? (
                <p className="empty-message" style={{ padding: 'var(--space-4)', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  No skills found. Import some!
                </p>
              ) : (
                skills.map(skill => (
                  <div key={skill.id} className="skill-item">
                    <div className="skill-info">
                      <strong>{skill.name} <span className="skill-id">({skill.id})</span></strong>
                      <p>{skill.description}</p>
                    </div>
                    <button 
                      className="delete-btn"
                      onClick={() => onDeleteSkill(skill.id)}
                      title="Delete skill"
                    >
                      🗑️
                    </button>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'import' && (
            <div className="import-skill-form">
              <p>Import skills from a JSON file. The file should contain an array of skill objects or a single skill object.</p>
              
              <div className="file-input-wrapper">
                <input 
                  type="file" 
                  ref={fileInputRef}
                  accept=".json" 
                  onChange={handleFileChange}
                />
                <div className="file-input-label">
                  Click to select JSON file
                </div>
              </div>

              {importError && (
                <p style={{ color: 'var(--status-error)', fontSize: 'var(--font-size-sm)' }}>
                  {importError}
                </p>
              )}

              <div style={{ marginTop: 'var(--space-2)', fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>
                <p><strong>Expected format:</strong></p>
                <pre style={{ 
                  background: 'var(--bg-primary)', 
                  padding: 'var(--space-2)', 
                  borderRadius: 'var(--radius-md)',
                  overflow: 'auto',
                  fontSize: '12px'
                }}>
{`[
  {
    "id": "skill_id",
    "name": "Skill Name",
    "description": "Description",
    "inputSchema": { "type": "object" },
    "outputSchema": { "type": "object" }
  }
]`}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}