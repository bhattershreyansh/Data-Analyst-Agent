import logging
from uuid import uuid4
from datetime import datetime
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.db_models import User, SavedChart as DBCart, Dashboard as DBDashboard
from app.schemas.api_schemas import SavedChart, DashboardCreateRequest, DashboardResponse

logger = logging.getLogger(__name__)
router = APIRouter(tags=["dashboards"])


def sync_user(db: Session, user_id: str):
    """Ensure user exists in metadata DB"""
    user = db.query(User).filter(User.user_id == user_id).first()
    if not user:
        user = User(user_id=user_id)
        db.add(user)
        db.commit()
        db.refresh(user)
    return user


# ─── SAVED CHARTS ENDPOINTS ─────────────────────────────────────────────

@router.post("/saved-charts", response_model=SavedChart)
async def create_saved_chart(
    chart: SavedChart, 
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Save a chart to SQL database"""
    try:
        user_id = user["user_id"]
        sync_user(db, user_id)
        
        # Check if chart exists for this user
        existing = db.query(DBCart).filter(DBCart.chart_id == chart.chart_id, DBCart.user_id == user_id).first()
        if existing:
            for key, value in chart.model_dump().items():
                setattr(existing, key, value)
            existing.user_id = user_id
            db.commit()
            return existing
        
        # Create new
        db_chart = DBCart(**chart.model_dump())
        db_chart.user_id = user_id
        db.add(db_chart)
        db.commit()
        db.refresh(db_chart)
        return db_chart
    except Exception as e:
        logger.error(f"Error saving chart to DB: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/saved-charts", response_model=List[SavedChart])
async def get_charts(
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List all saved charts for current user"""
    user_id = user["user_id"]
    return db.query(DBCart).filter(DBCart.user_id == user_id).all()


@router.get("/saved-charts/{chart_id}", response_model=SavedChart)
async def get_chart(
    chart_id: str, 
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a specific saved chart for current user"""
    user_id = user["user_id"]
    chart = db.query(DBCart).filter(DBCart.chart_id == chart_id, DBCart.user_id == user_id).first()
    if chart:
        return chart
    raise HTTPException(status_code=404, detail=f"Chart {chart_id} not found")


@router.delete("/saved-charts/{chart_id}")
async def delete_chart(
    chart_id: str, 
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a saved chart for current user"""
    user_id = user["user_id"]
    chart = db.query(DBCart).filter(DBCart.chart_id == chart_id, DBCart.user_id == user_id).first()
    if not chart:
        raise HTTPException(status_code=404, detail=f"Chart {chart_id} not found")
    
    db.delete(chart)
    db.commit()
    return {"success": True, "message": f"Chart {chart_id} deleted"}


@router.delete("/saved-charts")
async def clear_all_charts(
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Clear all saved charts for current user"""
    user_id = user["user_id"]
    count = db.query(DBCart).filter(DBCart.user_id == user_id).delete()
    db.commit()
    return {"success": True, "message": f"Cleared {count} charts"}


# ─── DASHBOARDS ENDPOINTS ───────────────────────────────────────────────

@router.post("/dashboard/create", response_model=DashboardResponse)
async def create_dashboard(
    request: DashboardCreateRequest, 
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a dashboard in SQL database"""
    try:
        user_id = user["user_id"]
        sync_user(db, user_id)
        
        # Get charts for this user
        if request.include_all:
            user_charts = db.query(DBCart).filter(DBCart.user_id == user_id).all()
        else:
            user_charts = db.query(DBCart).filter(
                DBCart.user_id == user_id, 
                DBCart.chart_id.in_(request.selected_chart_ids or [])
            ).all()
            
        if not user_charts:
            raise HTTPException(status_code=400, detail="No charts available for dashboard")
        
        dashboard_id = str(uuid4())
        db_dashboard = DBDashboard(
            dashboard_id=dashboard_id,
            user_id=user_id,
            name=request.dashboard_name,
            description=request.description,
            charts=[c.chart_id for c in user_charts],
            layout=request.layout,
            created_at=datetime.now(),
            total_charts=len(user_charts)
        )
        db.add(db_dashboard)
        db.commit()
        db.refresh(db_dashboard)
        
        response = db_dashboard.__dict__.copy()
        response['charts'] = user_charts
        return response
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Dashboard creation error: {e}")
        raise HTTPException(status_code=500, detail=f"Dashboard creation failed: {str(e)}")


@router.get("/dashboards", response_model=List[DashboardResponse])
async def get_dashboards(
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all dashboards for current user with full chart details"""
    user_id = user["user_id"]
    dashboards = db.query(DBDashboard).filter(DBDashboard.user_id == user_id).all()
    
    results = []
    for dash in dashboards:
        chart_ids = dash.charts if isinstance(dash.charts, list) else []
        charts = db.query(DBCart).filter(DBCart.chart_id.in_(chart_ids)).all()
        
        dash_dict = {c.name: getattr(dash, c.name) for c in dash.__table__.columns}
        dash_dict['charts'] = charts
        results.append(dash_dict)
        
    return results


@router.get("/dashboards/{dashboard_id}", response_model=DashboardResponse)
async def get_dashboard(
    dashboard_id: str, 
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a specific dashboard with full chart details for current user"""
    user_id = user["user_id"]
    dash = db.query(DBDashboard).filter(DBDashboard.dashboard_id == dashboard_id, DBDashboard.user_id == user_id).first()
    if not dash:
        raise HTTPException(status_code=404, detail=f"Dashboard {dashboard_id} not found")
    
    chart_ids = dash.charts if isinstance(dash.charts, list) else []
    charts = db.query(DBCart).filter(DBCart.chart_id.in_(chart_ids)).all()
    
    response = {c.name: getattr(dash, c.name) for c in dash.__table__.columns}
    response['charts'] = charts
    return response


@router.delete("/dashboards/{dashboard_id}")
async def delete_dashboard(
    dashboard_id: str, 
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a dashboard for current user"""
    user_id = user["user_id"]
    dash = db.query(DBDashboard).filter(DBDashboard.dashboard_id == dashboard_id, DBDashboard.user_id == user_id).first()
    if not dash:
        raise HTTPException(status_code=404, detail=f"Dashboard {dashboard_id} not found")
    
    db.delete(dash)
    db.commit()
    return {"success": True, "message": f"Dashboard {dashboard_id} deleted"}
