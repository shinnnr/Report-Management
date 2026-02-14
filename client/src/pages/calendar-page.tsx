import { LayoutWrapper } from "@/components/layout-wrapper";
import { useActivities, useCreateActivity, useDeleteActivity } from "@/hooks/use-activities";
import { 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval, 
  format, 
  isSameMonth, 
  isToday,
  isSameDay
} from "date-fns";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";

export default function CalendarPage() {
  const { user } = useAuth();
  const { data: activities } = useActivities();
  const createActivity = useCreateActivity();
  const deleteActivity = useDeleteActivity();

  const [currentDate, setCurrentDate] = useState(new Date());
  const [isNewActivityOpen, setIsNewActivityOpen] = useState(false);
  
  // Form State
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [deadline, setDeadline] = useState("");

  const daysInMonth = eachDayOfInterval({
    start: startOfMonth(currentDate),
    end: endOfMonth(currentDate),
  });

  // Calculate padding days for grid alignment
  const startDay = startOfMonth(currentDate).getDay();
  const paddingDays = Array.from({ length: startDay });

  const handleCreate = async () => {
    if (!title || !deadline) return;
    await createActivity.mutateAsync({
      title,
      description,
      startDate: new Date().toISOString(),
      deadlineDate: new Date(deadline).toISOString(),
      status: 'pending',
    });
    setIsNewActivityOpen(false);
    setTitle("");
    setDescription("");
    setDeadline("");
  };

  const getStatusColor = (status: string | null) => {
    switch(status) {
      case 'completed': return 'bg-green-100 text-green-700 border-green-200';
      case 'overdue': return 'bg-red-100 text-red-700 border-red-200';
      default: return 'bg-orange-100 text-orange-700 border-orange-200';
    }
  };

  return (
    <LayoutWrapper>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-display font-bold text-primary mb-2">Activity Calendar</h1>
          <p className="text-muted-foreground">Manage your schedule and deadlines.</p>
        </div>
        
        <Dialog open={isNewActivityOpen} onOpenChange={setIsNewActivityOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 shadow-lg shadow-primary/20 bg-primary">
              <Plus className="w-4 h-4" /> Add Activity
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New Activity</DialogTitle>
              <DialogDescription>Create a new activity with a title, description, and deadline.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Submit Q1 Report" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="desc">Description</Label>
                <Textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="date">Deadline</Label>
                <Input type="date" id="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleCreate} disabled={createActivity.isPending}>
                {createActivity.isPending ? "Creating..." : "Create Activity"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="bg-white rounded-xl shadow-lg border overflow-hidden">
        {/* Calendar Header */}
        <div className="flex items-center justify-between p-6 border-b bg-muted/20">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-bold font-display text-primary">
              {format(currentDate, 'MMMM yyyy')}
            </h2>
            <div className="flex gap-1">
              <Button variant="outline" size="icon" onClick={() => setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() - 1)))}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={() => setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() + 1)))}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
          <div className="text-sm text-muted-foreground font-medium">
            {activities?.length} Scheduled Activities
          </div>
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7 border-b">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
            <div key={day} className="py-3 text-center text-sm font-semibold text-muted-foreground border-r last:border-r-0 bg-muted/5">
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 min-h-[600px] auto-rows-fr">
          {paddingDays.map((_, i) => (
            <div key={`padding-${i}`} className="bg-muted/5 border-b border-r last:border-r-0" />
          ))}
          
          {daysInMonth.map((date) => {
            const dayActivities = activities?.filter(a => isSameDay(new Date(a.deadlineDate), date));
            
            return (
              <div 
                key={date.toISOString()} 
                className={cn(
                  "p-2 border-b border-r last:border-r-0 min-h-[100px] transition-colors hover:bg-muted/5",
                  isToday(date) && "bg-accent/5"
                )}
              >
                <div className={cn(
                  "w-7 h-7 flex items-center justify-center rounded-full text-sm font-medium mb-2",
                  isToday(date) ? "bg-accent text-white shadow-sm" : "text-muted-foreground"
                )}>
                  {format(date, 'd')}
                </div>
                
                <div className="space-y-1">
                  {dayActivities?.map(activity => (
                    <div 
                      key={activity.id}
                      className={cn(
                        "text-xs p-1.5 rounded-md border truncate font-medium flex items-center justify-between group cursor-pointer",
                        getStatusColor(activity.status)
                      )}
                    >
                      <span className="truncate">{activity.title}</span>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteActivity.mutate(activity.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 className="w-3 h-3 text-destructive" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </LayoutWrapper>
  );
}
