import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { OverviewPage } from './pages/OverviewPage';
import { WorkflowsPage } from './pages/WorkflowsPage';
import { ExecutePage } from './pages/ExecutePage';
import { ExecutionDetailsPage } from './pages/ExecutionDetailsPage';
import { ExplanationPage } from './pages/ExplanationPage';
import { ManualReviewPage } from './pages/ManualReviewPage';
import { ChaosSimulationPage } from './pages/ChaosSimulationPage';
import { api } from './api/client';

export function App() {
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedExecutionId, setSelectedExecutionId] = useState(null);
  const [selectedWorkflowKey, setSelectedWorkflowKey] = useState('loan-approval');
  const [pendingReviewCount, setPendingReviewCount] = useState(0);

  const fetchPendingReviews = async () => {
    try {
      const res = await api.listPendingReviews();
      setPendingReviewCount(res.data?.length || 0);
    } catch (e) {
      // Quiet fail if server is initializing
    }
  };

  useEffect(() => {
    fetchPendingReviews();
    const interval = setInterval(fetchPendingReviews, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleViewExecution = (id) => {
    setSelectedExecutionId(id);
    setActiveTab('details');
  };

  const handleViewExplanation = (id) => {
    setSelectedExecutionId(id);
    setActiveTab('explanation');
  };

  const handleSelectWorkflowToExecute = (key) => {
    setSelectedWorkflowKey(key);
    setActiveTab('execute');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      {/* Top Navigation */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={(tab) => {
          setActiveTab(tab);
        }}
        pendingReviewCount={pendingReviewCount}
      />

      {/* Main View Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'overview' && (
          <OverviewPage
            onViewExecution={handleViewExecution}
            onSelectWorkflow={handleSelectWorkflowToExecute}
          />
        )}

        {activeTab === 'workflows' && (
          <WorkflowsPage
            onExecuteWorkflow={handleSelectWorkflowToExecute}
          />
        )}

        {activeTab === 'execute' && (
          <ExecutePage
            initialWorkflowKey={selectedWorkflowKey}
            onViewExecution={handleViewExecution}
          />
        )}

        {activeTab === 'details' && (
          <ExecutionDetailsPage
            executionId={selectedExecutionId}
            onBack={() => setActiveTab('overview')}
            onExplain={handleViewExplanation}
          />
        )}

        {activeTab === 'explanation' && (
          <ExplanationPage
            initialExecutionId={selectedExecutionId}
          />
        )}

        {activeTab === 'review' && (
          <ManualReviewPage
            onReviewsUpdated={setPendingReviewCount}
          />
        )}

        {activeTab === 'chaos' && (
          <ChaosSimulationPage
            onViewExecution={handleViewExecution}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-6 text-center text-xs text-slate-500">
        <p>FlowGuard – Workflow Decision & Resilience Engine</p>
      </footer>
    </div>
  );
}

export default App;

