import json
from pathlib import Path
from typing import Dict, List, Optional
import logging
import hashlib

logger = logging.getLogger(__name__)

class CacheManager:
    def __init__(self, cache_dir: str = "./cache"):
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        
        # Files for various cache types
        self.smart_questions_file = self.cache_dir / "smart_questions.json"
        self.insights_file = self.cache_dir / "insights_cache.json"
        
        # In-memory maps
        self.smart_questions = self._load_json(self.smart_questions_file)
        self.insights = self._load_json(self.insights_file)
        
    def _load_json(self, path: Path) -> Dict:
        if path.exists():
            try:
                with open(path, 'r') as f:
                    return json.load(f)
            except Exception as e:
                logger.error(f"Error loading cache {path}: {e}")
                return {}
        return {}
    
    def _save_json(self, data: Dict, path: Path):
        try:
            with open(path, 'w') as f:
                json.dump(data, f, indent=2)
        except Exception as e:
            logger.error(f"Error saving cache {path}: {e}")

    # Smart Questions
    def get_smart_questions(self, source_id: str) -> Optional[List[Dict]]:
        return self.smart_questions.get(source_id)

    def set_smart_questions(self, source_id: str, questions: List[Dict]):
        self.smart_questions[source_id] = questions
        self._save_json(self.smart_questions, self.smart_questions_file)

    # Insights & Suggestions
    def get_insights(self, source_id: str, question: str) -> Optional[Dict]:
        key = self._generate_key(source_id, question)
        return self.insights.get(key)

    def set_insights(self, source_id: str, question: str, data: Dict):
        key = self._generate_key(source_id, question)
        self.insights[key] = data
        self._save_json(self.insights, self.insights_file)

    def _generate_key(self, source_id: str, question: str) -> str:
        raw = f"{source_id}:{question.strip().lower()}"
        return hashlib.md5(raw.encode()).hexdigest()

# Global cache instance
cache_manager = CacheManager()
