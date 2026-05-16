export interface Question {
  question: string;
  answers: string[];
  correctIndex: number;
}

export interface UserSession {
  questions: Question[];
  currentIndex: number;
  score: number;
}
