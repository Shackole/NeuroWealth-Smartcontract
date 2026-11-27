'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  ChevronRight,
  ChevronLeft,
  Wallet,
  TrendingUp,
  ArrowDownCircle,
  PieChart,
  CheckCircle,
  RotateCcw,
  Play,
} from 'lucide-react';

interface TutorialStep {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  target?: string;
}

const STEPS: TutorialStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to NeuroWealth',
    description: 'AI-powered DeFi yield optimization on Stellar. Let us show you around.',
    icon: <TrendingUp className="w-6 h-6" />,
  },
  {
    id: 'connect-wallet',
    title: 'Connect Your Wallet',
    description: 'Connect your Freighter or Albedo wallet to start earning yield on your USDC.',
    icon: <Wallet className="w-6 h-6" />,
    target: 'connect-wallet-btn',
  },
  {
    id: 'strategies',
    title: 'AI-Powered Strategies',
    description:
      'Our AI agent automatically rebalances between DeFi protocols to maximize your yield.',
    icon: <PieChart className="w-6 h-6" />,
  },
  {
    id: 'deposit',
    title: 'Make Your First Deposit',
    description:
      'Deposit USDC into the vault. The AI will deploy it across yield-generating protocols.',
    icon: <ArrowDownCircle className="w-6 h-6" />,
    target: 'deposit-btn',
  },
  {
    id: 'portfolio',
    title: 'Track Your Portfolio',
    description:
      'Watch your earnings grow in real-time. View detailed analytics and transaction history.',
    icon: <TrendingUp className="w-6 h-6" />,
  },
];

const COMPLETION_KEY = 'neurowealth-onboarding-completed';
const STEP_KEY = 'neurowealth-onboarding-step';

type ModalState = 'closed' | 'resume-prompt' | 'tutorial';

export function OnboardingTutorial() {
  const [modalState, setModalState] = useState<ModalState>('closed');
  const [currentStep, setCurrentStep] = useState(0);
  const stepTitleRef = useRef<HTMLHeadingElement>(null);

  // Focus the step title whenever the tutorial opens or the step changes.
  useEffect(() => {
    if (modalState === 'tutorial' && stepTitleRef.current) {
      stepTitleRef.current.focus();
    }
  }, [modalState, currentStep]);

  useEffect(() => {
    const completed = localStorage.getItem(COMPLETION_KEY);
    if (completed) return;

    const savedStep = localStorage.getItem(STEP_KEY);

    const timer = setTimeout(() => {
      if (savedStep !== null) {
        // Partial progress: show the resume/restart prompt.
        setCurrentStep(parseInt(savedStep, 10));
        setModalState('resume-prompt');
      } else {
        // First visit: start from step 0.
        setCurrentStep(0);
        setModalState('tutorial');
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, []);

  const persistStep = (step: number) => {
    localStorage.setItem(STEP_KEY, String(step));
  };

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      const next = currentStep + 1;
      setCurrentStep(next);
      persistStep(next);
    } else {
      complete();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      const prev = currentStep - 1;
      setCurrentStep(prev);
      persistStep(prev);
    }
  };

  const goToStep = (index: number) => {
    setCurrentStep(index);
    persistStep(index);
  };

  const complete = () => {
    localStorage.removeItem(STEP_KEY);
    localStorage.setItem(COMPLETION_KEY, 'true');
    setModalState('closed');
  };

  const skip = () => {
    localStorage.removeItem(STEP_KEY);
    localStorage.setItem(COMPLETION_KEY, 'true');
    setModalState('closed');
  };

  const handleResume = () => {
    // Step was already restored from storage in the useEffect above.
    setModalState('tutorial');
  };

  const handleRestart = () => {
    setCurrentStep(0);
    persistStep(0);
    setModalState('tutorial');
  };

  const handleClosePrompt = () => {
    // Leave both keys unchanged so the prompt reappears next visit.
    setModalState('closed');
  };

  if (modalState === 'closed') return null;

  // -------------------------------------------------------------------------
  // Resume / restart prompt
  // -------------------------------------------------------------------------
  if (modalState === 'resume-prompt') {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="resume-prompt-heading"
      >
        <div className="glass-panel rounded-2xl p-6 max-w-sm w-full mx-4 relative">
          <button
            onClick={handleClosePrompt}
            className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
            aria-label="Close prompt"
          >
            <X size={20} />
          </button>

          <h3
            id="resume-prompt-heading"
            className="text-xl font-bold text-white mb-2"
          >
            Continue your tour?
          </h3>
          <p className="text-sm text-slate-400 mb-6">
            You were on step {currentStep + 1} of {STEPS.length}:{' '}
            <span className="text-white font-medium">{STEPS[currentStep]?.title}</span>.
          </p>

          <div className="flex items-center gap-3">
            <button
              onClick={handleRestart}
              className="flex items-center gap-2 px-4 py-2.5 text-sm text-slate-300 border border-slate-600 hover:border-slate-400 hover:text-white rounded-xl transition-colors"
            >
              <RotateCcw size={15} aria-hidden="true" />
              Start over
            </button>
            <button
              onClick={handleResume}
              className="flex flex-1 items-center justify-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-medium rounded-xl transition-colors"
            >
              <Play size={15} aria-hidden="true" />
              Resume
              <ChevronRight size={15} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Tutorial modal
  // -------------------------------------------------------------------------
  const step = STEPS[currentStep];
  const progress = ((currentStep + 1) / STEPS.length) * 100;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tutorial-step-title"
    >
      <div className="glass-panel rounded-2xl p-6 max-w-md w-full mx-4 relative">
        <button
          onClick={skip}
          className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
          aria-label="Skip tutorial"
        >
          <X size={20} />
        </button>

        {/* Progress bar */}
        <div className="mb-6">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span>
              Step {currentStep + 1} of {STEPS.length}
            </span>
            <button onClick={skip} className="hover:text-emerald-400 transition-colors">
              Skip tour
            </button>
          </div>
          <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 transition-all duration-300"
              style={{ width: `${progress}%` }}
              role="progressbar"
              aria-valuenow={currentStep + 1}
              aria-valuemin={1}
              aria-valuemax={STEPS.length}
            />
          </div>
        </div>

        {/* Step content */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="p-4 rounded-2xl bg-emerald-500/10 text-emerald-400 mb-4">
            {step.icon}
          </div>
          {/* tabIndex={-1} allows programmatic focus without adding to tab order */}
          <h3
            id="tutorial-step-title"
            data-testid="onboarding-step-title"
            ref={stepTitleRef}
            tabIndex={-1}
            className="text-xl font-bold text-white mb-2 outline-none"
          >
            {step.title}
          </h3>
          <p className="text-slate-400 text-sm leading-relaxed">{step.description}</p>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <button
            onClick={handlePrev}
            disabled={currentStep === 0}
            className="flex items-center gap-1 px-4 py-2 text-sm text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft size={16} />
            Back
          </button>

          <button
            onClick={handleNext}
            className="flex items-center gap-1 px-6 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-medium rounded-xl transition-colors"
          >
            {currentStep === STEPS.length - 1 ? (
              <>
                Get Started
                <CheckCircle size={16} />
              </>
            ) : (
              <>
                Next
                <ChevronRight size={16} />
              </>
            )}
          </button>
        </div>

        {/* Dot navigation */}
        <div className="flex justify-center gap-1.5 mt-6">
          {STEPS.map((_, i) => (
            <button
              key={i}
              onClick={() => goToStep(i)}
              className={`w-2 h-2 rounded-full transition-all duration-200 ${
                i === currentStep
                  ? 'bg-emerald-400 w-6'
                  : i < currentStep
                  ? 'bg-emerald-500/50'
                  : 'bg-slate-600'
              }`}
              aria-label={`Go to step ${i + 1}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
