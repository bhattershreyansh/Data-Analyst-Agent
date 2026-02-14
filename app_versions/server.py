import uvicorn
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from ag_ui.core import (
    EventType, 
    RunStartedEvent, 
    TextMessageStartEvent, 
    TextMessageContentEvent, 
    TextMessageEndEvent, 
    RunFinishedEvent,
    RunErrorEvent,
    RunAgentInput
)
from ag_ui.encoder import EventEncoder
from app_versions.dashboard_agent import DashboardAgent

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

def extract_question(data):
    try:
        messages = (
            data.get("messages")
            or data.get("variables", {}).get("data", {}).get("messages")
        )
        if messages:
            for msg in reversed(messages):
                content = None
                role = None
                if "textMessage" in msg:
                    content = msg["textMessage"].get("content")
                    role = msg["textMessage"].get("role")
                else:
                    content = msg.get("content")
                    role = msg.get("role")
                if role == "user" and content:
                    return content
    except Exception as e:
        print("Error extracting question:", e)
    return None

agent = DashboardAgent()

import re
import json

def camel_to_snake(name):
    s1 = re.sub('(.)([A-Z][a-z]+)', r'\1_\2', name)
    return re.sub('([a-z0-9])([A-Z])', r'\1_\2', s1).lower()

def event_to_snake_dict(event):
    # If event is a Pydantic model, use .__dict__ or .dict()
    d = event.__dict__ if hasattr(event, '__dict__') else dict(event)
    return {camel_to_snake(k): v for k, v in d.items()}

def sse_event(data):
    return f"data: {json.dumps(data)}\n\n"

@app.post("/agent")
async def agent_endpoint(request: Request):
    try:
        data = await request.json()
        print("Full request data:", data)
        question = extract_question(data)
        if not question or question.strip() == "":
            question = "Please ask me a question about the hospital data. For example: 'How many patients are there?' or 'Show me bed availability'"
        print("Processing question:", question)
        
        accept_header = request.headers.get("accept", "text/event-stream")
        encoder = EventEncoder(accept=accept_header)
        print(f"Using encoder with accept: {accept_header}")
        
        run_id = data.get("run_id", "run_1")
        thread_id = data.get("thread_id", "thread_1")
        message_id = f"msg_{run_id}"
        print(f"Generated IDs - run: {run_id}, thread: {thread_id}, message: {message_id}")
        
        async def event_generator():
            try:
                yield sse_event(event_to_snake_dict(RunStartedEvent(
                    type=EventType.RUN_STARTED,
                    thread_id=thread_id,
                    run_id=run_id
                )))
                print("Sent RUN_STARTED")
                yield sse_event(event_to_snake_dict(TextMessageStartEvent(
                    type=EventType.TEXT_MESSAGE_START,
                    message_id=message_id,
                    role="assistant"
                )))
                print("Sent TEXT_MESSAGE_START")
                # Pass message_id to agent
                for event in agent.run({"question": question, "message_id": message_id}):
                    # event is a TextMessageContentEvent or dict with correct keys
                    yield sse_event(event_to_snake_dict(event))
                yield sse_event(event_to_snake_dict(TextMessageEndEvent(
                    type=EventType.TEXT_MESSAGE_END,
                    message_id=message_id
                )))
                print("Sent TEXT_MESSAGE_END")
                yield sse_event(event_to_snake_dict(RunFinishedEvent(
                    type=EventType.RUN_FINISHED,
                    thread_id=thread_id,
                    run_id=run_id
                )))
                print("Sent RUN_FINISHED")
            except Exception as e:
                print(f"Error in event generator: {e}")
                yield sse_event({
                    "type": "RUN_ERROR",
                    "thread_id": thread_id,
                    "run_id": run_id,
                    "error": str(e)
                })
        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream"
        )
    except Exception as e:
        print(f"Error in endpoint: {e}")
        return {"error": str(e)}

@app.get("/")
async def root():
    return {"message": "Hospital Analytics Backend is running!"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)