import { useEffect, useRef } from 'react';
import { useGymLogData } from '../context/DataContext';

// Close only the form whose saved intent completed, including an explicit recovery.
export default function useWriteCompletion(action, onComplete) {
  const { completedWrite } = useGymLogData();
  const seen = useRef(completedWrite?.id);
  const callback = useRef(onComplete);
  callback.current = onComplete;
  useEffect(() => {
    if (!completedWrite || seen.current === completedWrite.id) return;
    seen.current = completedWrite.id;
    if (completedWrite.action === action) callback.current(completedWrite.payload);
  }, [completedWrite, action]);
}
