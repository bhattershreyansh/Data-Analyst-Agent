# test_with_charts.py
import plotly.express as px
import plotly.graph_objects as go
from plotly.subplots import make_subplots
import pandas as pd
from agnet_rag import hospital_sql_query_rag

def create_chart(chart_config, data):
    """Create Plotly chart based on configuration"""
    if not chart_config or not data:
        print("❌ No chart data available")
        return None
    
    # Convert data to DataFrame for easier handling
    df = pd.DataFrame(data)
    
    chart_type = chart_config.get('type', 'table')
    x_col = chart_config.get('x', '')
    y_col = chart_config.get('y', '')
    title = chart_config.get('title', 'Chart')
    
    print(f"📊 Creating {chart_type} chart: {title}")
    print(f"   X-axis: {x_col}, Y-axis: {y_col}")
    
    try:
        if chart_type == 'bar':
            fig = px.bar(df, x=x_col, y=y_col, title=title)
        elif chart_type == 'pie':
            fig = px.pie(df, names=x_col, values=y_col, title=title)
        elif chart_type == 'line':
            fig = px.line(df, x=x_col, y=y_col, title=title)
        elif chart_type == 'table':
            fig = go.Figure(data=[go.Table(
                header=dict(values=list(df.columns)),
                cells=dict(values=[df[col] for col in df.columns])
            )])
            fig.update_layout(title=title)
        else:
            print(f"❌ Unknown chart type: {chart_type}")
            return None
        
        # Show the chart
        fig.show()
        return fig
        
    except Exception as e:
        print(f"❌ Error creating chart: {e}")
        return None

def test_with_charts():
    """Test RAG system with chart visualization"""
    
    test_questions = [
        "Count patients by age group",
        "Show doctors by department", 
        "Appointments by status",
        "Patient distribution by gender"
    ]
    
    print("🧪 Testing RAG System with Charts")
    print("=" * 60)
    
    for i, question in enumerate(test_questions, 1):
        print(f"\n🔍 Test {i}: {question}")
        print("-" * 40)
        
        try:
            result = hospital_sql_query_rag(question)
            
            if result.get("error"):
                print(f"❌ Error: {result['error']}")
                continue
                
            print(f"✅ Success!")
            print(f"📊 Tables: {', '.join(result.get('retrieved_tables', []))}")
            print(f"🔍 SQL: {result['query']}")
            print(f"📈 Rows: {result.get('row_count', 0)}")
            
            # Show chart configuration
            chart_config = result.get('chart')
            if chart_config:
                print(f"📉 Chart Config: {chart_config}")
                
                # Create and show chart
                data = result.get('result', [])
                if data:
                    create_chart(chart_config, data)
                else:
                    print("❌ No data to chart")
            else:
                print("📉 Chart: None (table type filtered out)")
                
            # Show sample data
            if result.get('result'):
                print(f"\n📋 Sample Data:")
                for j, row in enumerate(result['result'][:3]):
                    print(f"   Row {j+1}: {row}")
                    
        except Exception as e:
            print(f"❌ Exception: {e}")
        
        print("\n" + "="*60)

if __name__ == "__main__":
    test_with_charts()