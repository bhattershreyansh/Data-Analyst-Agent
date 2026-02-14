# test_rag_simple.py
from agnet_rag import hospital_sql_query_rag

def test_simple():
    """Simple test for the RAG system"""
    
    test_questions = [
        "How many patients do we have?",
        "Show me doctors by department",
        "What are the recent appointments?"
    ]
    
    print("🧪 Testing RAG System")
    print("=" * 50)
    
    for i, question in enumerate(test_questions, 1):
        print(f"\n🔍 Test {i}: {question}")
        print("-" * 30)
        
        try:
            result = hospital_sql_query_rag(question)
            
            if result.get("error"):
                print(f"❌ Error: {result['error']}")
            else:
                print(f"✅ Success!")
                print(f"📊 Tables: {', '.join(result.get('retrieved_tables', []))}")
                print(f"🔍 SQL: {result['query']}")
                print(f"📈 Rows: {result.get('row_count', 0)}")
                
                # Safe chart type check
                chart = result.get('chart')
                if chart:
                    print(f"📉 Chart: {chart.get('type', 'none')}")
                else:
                    print(f"📉 Chart: none")
                
                # Show first result
                if result.get('result'):
                    print(f"📋 Sample: {result['result'][0] if result['result'] else 'No data'}")
                    
        except Exception as e:
            print(f"❌ Exception: {e}")
        
        print()

if __name__ == "__main__":
    test_simple()