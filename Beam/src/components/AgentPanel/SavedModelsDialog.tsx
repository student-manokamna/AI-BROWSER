import React, { useState, useEffect } from 'react';
import { UserModel } from '../../types';

interface SavedModelsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  userModels: UserModel[];
  activeModelId?: string;
  onSetActiveModel: (id: string) => void;
  onDeleteModel: (id: string) => void;
  onUpdateModel: (id: string, updates: any) => void;
}

interface ModelDetail {
  id: string;
  name: string;
  provider: string;
  model: string;
  apiKey: string;
  baseURL?: string;
}

export function SavedModelsDialog({
  isOpen,
  onClose,
  userModels,
  activeModelId,
  onSetActiveModel,
  onDeleteModel,
  onUpdateModel
}: SavedModelsDialogProps) {
  const [selectedModel, setSelectedModel] = useState<ModelDetail | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editModel, setEditModel] = useState<ModelDetail | null>(null);
  const [apiKeyVisible, setApiKeyVisible] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (selectedModel && !userModels.find(m => m.id === selectedModel.id)) {
      // Selected model was deleted
      setSelectedModel(null);
      setShowEditDialog(false);
    }
  }, [userModels, selectedModel]);

  if (!isOpen) return null;

  const handleModelClick = (model: UserModel) => {
    setSelectedModel({
      id: model.id,
      name: model.name,
      provider: model.provider,
      model: model.model,
      apiKey: model.apiKey || '',
      baseURL: model.baseURL
    });
  };

  const handleSetAsActive = (modelId: string) => {
    onSetActiveModel(modelId);
    setSelectedModel(null);
  };

  const handleDelete = (modelId: string) => {
    if (window.confirm('Are you sure you want to delete this model?')) {
      onDeleteModel(modelId);
      setSelectedModel(null);
    }
  };

  const handleEditClick = (model: UserModel) => {
    setEditModel({
      id: model.id,
      name: model.name,
      provider: model.provider,
      model: model.model,
      apiKey: model.apiKey || '',
      baseURL: model.baseURL
    });
    setShowEditDialog(true);
  };

  const handleSaveEdit = () => {
    if (editModel) {
      onUpdateModel(editModel.id, {
        name: editModel.name,
        apiKey: editModel.apiKey,
        baseURL: editModel.baseURL
      });
      setShowEditDialog(false);
      setEditModel(null);
    }
  };

  const toggleApiKeyVisibility = (modelId: string) => {
    setApiKeyVisible(prev => ({
      ...prev,
      [modelId]: !prev[modelId]
    }));
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="saved-models-dialog" onClick={e => e.stopPropagation()}>
        <div className="dialog-header">
          <h3>Saved Models</h3>
          <button className="dialog-close" onClick={onClose}>×</button>
        </div>

        <div className="dialog-content">
          {/* Model List */}
          <div className="model-list">
            {userModels.length === 0 ? (
              <div className="empty-state">
                <p>No saved models yet</p>
                <small>Test a connection and click "Save Model" to add one</small>
              </div>
            ) : (
              userModels.map(model => (
                <div
                  key={model.id}
                  className={`model-item ${activeModelId === model.id ? 'active' : ''} ${selectedModel?.id === model.id ? 'selected' : ''}`}
                  onClick={() => handleModelClick(model)}
                >
                  <div className="model-info">
                    <span className="model-name">{model.name}</span>
                    <span className="model-provider">{model.provider}</span>
                  </div>
                  {activeModelId === model.id && (
                    <span className="active-badge">✓ Active</span>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Model Details Panel */}
          {selectedModel && (
            <div className="model-details">
              <h4>Model Details</h4>
              <div className="detail-row">
                <span className="detail-label">Name:</span>
                <span className="detail-value">{selectedModel.name}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Provider:</span>
                <span className="detail-value">{selectedModel.provider}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Model:</span>
                <span className="detail-value">{selectedModel.model}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">API Key:</span>
                <span className="detail-value">
                  {apiKeyVisible[selectedModel.id] ? selectedModel.apiKey : '••••••••••••'}
                  <button
                    className="toggle-api-key"
                    onClick={() => toggleApiKeyVisibility(selectedModel.id)}
                  >
                    {apiKeyVisible[selectedModel.id] ? '👁️' : '👁️‍🗨️'}
                  </button>
                </span>
              </div>
              
              <div className="detail-actions">
                <button
                  className="action-btn set-active"
                  onClick={() => handleSetAsActive(selectedModel.id)}
                  disabled={activeModelId === selectedModel.id}
                >
                  Set as Active
                </button>
                <button
                  className="action-btn edit"
                  onClick={() => handleEditClick(userModels.find(m => m.id === selectedModel.id)!)}
                >
                  Edit
                </button>
                <button
                  className="action-btn delete"
                  onClick={() => handleDelete(selectedModel.id)}
                >
                  Delete
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Edit Model Dialog */}
      {showEditDialog && editModel && (
        <div className="dialog-overlay" onClick={() => setShowEditDialog(false)}>
          <div className="edit-model-dialog" onClick={e => e.stopPropagation()}>
            <div className="dialog-header">
              <h4>Edit Model</h4>
              <button className="dialog-close" onClick={() => setShowEditDialog(false)}>×</button>
            </div>
            <div className="dialog-content">
              <div className="form-group">
                <label>Model Name</label>
                <input
                  type="text"
                  value={editModel.name}
                  onChange={(e) => setEditModel({ ...editModel, name: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>API Key</label>
                <input
                  type="password"
                  value={editModel.apiKey}
                  onChange={(e) => setEditModel({ ...editModel, apiKey: e.target.value })}
                />
              </div>
              {editModel.baseURL && (
                <div className="form-group">
                  <label>Base URL</label>
                  <input
                    type="text"
                    value={editModel.baseURL}
                    onChange={(e) => setEditModel({ ...editModel, baseURL: e.target.value })}
                  />
                </div>
              )}
              <div className="dialog-actions">
                <button className="btn-cancel" onClick={() => setShowEditDialog(false)}>Cancel</button>
                <button className="btn-save" onClick={handleSaveEdit}>Save Changes</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
